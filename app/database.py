from contextlib import contextmanager
import logging
from typing import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from .config import get_settings
from .models import User
from .utils.security import get_password_hash


settings = get_settings()
is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
logger = logging.getLogger(__name__)
SCHEMA_VERSION_TABLE = "app_schema_version"
CURRENT_SCHEMA_VERSION = "20261109_quote_usd_01"
POSTGRES_MIGRATION_LOCK_ID = 2026110501
REQUIRED_SCHEMA_INDEXES = {
    "scenarios": {"uq_scenarios_primary_year"},
    "budget_preparation_allocations": {"uq_preparation_item_year_month"},
}
engine = create_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=not is_sqlite,
    connect_args=connect_args,
)


class SchemaValidationError(RuntimeError):
    """Raised when the database is not at the schema expected by this release."""


def _read_schema_version(connection) -> str | None:
    inspector = inspect(connection)
    if not inspector.has_table(SCHEMA_VERSION_TABLE):
        return None
    return connection.execute(
        text(f"SELECT version FROM {SCHEMA_VERSION_TABLE} WHERE id = 1")
    ).scalar_one_or_none()


def _schema_contract_errors(connection, *, require_version: bool = True) -> list[str]:
    inspector = inspect(connection)
    existing_tables = set(inspector.get_table_names())
    errors: list[str] = []

    version = _read_schema_version(connection)
    if require_version and version is None:
        errors.append("schema version marker is missing")
    elif require_version and version != CURRENT_SCHEMA_VERSION:
        errors.append(
            f"schema version is {version!r}; expected {CURRENT_SCHEMA_VERSION!r}"
        )

    expected_tables = {
        table.name: {column.name for column in table.columns}
        for table in SQLModel.metadata.tables.values()
    }
    for table_name, expected_columns in sorted(expected_tables.items()):
        if table_name not in existing_tables:
            errors.append(f"required table {table_name!r} is missing")
            continue
        actual_columns = {
            column["name"] for column in inspector.get_columns(table_name)
        }
        missing_columns = sorted(expected_columns - actual_columns)
        if missing_columns:
            errors.append(
                f"table {table_name!r} is missing columns: {', '.join(missing_columns)}"
            )

    for table_name, required_indexes in REQUIRED_SCHEMA_INDEXES.items():
        if table_name not in existing_tables:
            continue
        actual_indexes = {
            index.get("name") for index in inspector.get_indexes(table_name)
        }
        actual_indexes.update(
            constraint.get("name")
            for constraint in inspector.get_unique_constraints(table_name)
        )
        missing_indexes = sorted(required_indexes - actual_indexes)
        if missing_indexes:
            errors.append(
                f"table {table_name!r} is missing indexes: {', '.join(missing_indexes)}"
            )

    return errors


def validate_database_schema(
    *,
    require_postgresql: bool = False,
    require_version: bool = True,
) -> None:
    """Validate the schema without issuing DDL or DML."""

    if require_postgresql and engine.dialect.name != "postgresql":
        raise SchemaValidationError(
            "Production database must use PostgreSQL; no schema changes were attempted."
        )

    with engine.connect() as connection:
        errors = _schema_contract_errors(
            connection,
            require_version=require_version,
        )

    if errors:
        raise SchemaValidationError(
            "Database schema is not ready for this release: "
            + "; ".join(errors)
            + ". Run the explicit migration command before starting the API."
        )


def _record_schema_version() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                f"CREATE TABLE IF NOT EXISTS {SCHEMA_VERSION_TABLE} ("
                "id INTEGER PRIMARY KEY, "
                "version VARCHAR(64) NOT NULL, "
                "updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "CONSTRAINT ck_app_schema_version_singleton CHECK (id = 1)"
                ")"
            )
        )
        connection.execute(
            text(
                f"INSERT INTO {SCHEMA_VERSION_TABLE} (id, version, updated_at) "
                "VALUES (1, :version, CURRENT_TIMESTAMP) "
                "ON CONFLICT (id) DO UPDATE SET "
                "version = EXCLUDED.version, updated_at = CURRENT_TIMESTAMP"
            ),
            {"version": CURRENT_SCHEMA_VERSION},
        )


def baseline_schema_version() -> None:
    """Record the current version only after a read-only schema contract check."""

    validate_database_schema(
        require_postgresql=settings.is_production,
        require_version=False,
    )
    _record_schema_version()
    validate_database_schema(require_postgresql=settings.is_production)


def apply_schema_migrations() -> None:
    """Apply schema changes explicitly; production startup never calls this function."""

    if settings.is_production and engine.dialect.name != "postgresql":
        raise RuntimeError("Production migrations require PostgreSQL.")

    with engine.connect() as connection:
        current_version = _read_schema_version(connection)
    if current_version == CURRENT_SCHEMA_VERSION:
        validate_database_schema(require_postgresql=settings.is_production)
        logger.info("Database schema is already at version %s.", CURRENT_SCHEMA_VERSION)
        return

    lock_connection = None
    try:
        if engine.dialect.name == "postgresql":
            lock_connection = engine.connect()
            lock_connection.execute(
                text("SELECT pg_advisory_lock(:lock_id)"),
                {"lock_id": POSTGRES_MIGRATION_LOCK_ID},
            )
            if _read_schema_version(lock_connection) == CURRENT_SCHEMA_VERSION:
                validate_database_schema(require_postgresql=settings.is_production)
                logger.info(
                    "Database schema reached version %s while waiting for the migration lock.",
                    CURRENT_SCHEMA_VERSION,
                )
                return

        SQLModel.metadata.create_all(engine)
        _apply_schema_upgrades()
        _record_schema_version()
        validate_database_schema(require_postgresql=settings.is_production)
    finally:
        if lock_connection is not None:
            try:
                lock_connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": POSTGRES_MIGRATION_LOCK_ID},
                )
            finally:
                lock_connection.close()


def init_db() -> None:
    if settings.is_production:
        validate_database_schema(require_postgresql=True)
        logger.info("Production schema validation succeeded; startup performed no DDL or DML.")
        return

    apply_schema_migrations()
    with Session(engine) as session:
        init_default_admin(session)


@contextmanager
def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def init_default_admin(session: Session) -> None:
    """Create the initial admin once, without mutating any existing user."""

    if not settings.admin_bootstrap_enabled:
        logger.info("Admin bootstrap is disabled.")
        return

    admin_username = "admin"
    admin_email = settings.DEFAULT_ADMIN_EMAIL.strip().lower()
    admin_full_name = settings.DEFAULT_ADMIN_FULL_NAME or "Admin Kullanıcı"
    admin_password = settings.DEFAULT_ADMIN_PASSWORD

    if not admin_email or not admin_password.strip():
        logger.warning("Admin bootstrap skipped because required credentials are missing.")
        return

    if session.exec(select(User.id).limit(1)).first() is not None:
        logger.info("Admin bootstrap skipped because users already exist.")
        return

    user = User(
        username=admin_username,
        email=admin_email,
        full_name=admin_full_name,
        hashed_password=get_password_hash(admin_password),
        is_admin=True,
        role="admin",
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    logger.info("Initial admin account created.")


def ensure_warranty_schema(inspector) -> None:
    if not inspector.has_table("warranty_items"):
        return
    warranty_column_info = {column["name"]: column for column in inspector.get_columns("warranty_items")}
    warranty_columns = set(warranty_column_info)
    is_postgres = engine.dialect.name == "postgresql"
    if (
        is_postgres
        and "location" in warranty_column_info
        and not warranty_column_info["location"].get("nullable", True)
    ):
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ALTER COLUMN location DROP NOT NULL"))
    if (
        is_postgres
        and "end_date" in warranty_column_info
        and not warranty_column_info["end_date"].get("nullable", True)
    ):
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ALTER COLUMN end_date DROP NOT NULL"))
    if "domain" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN domain TEXT"))
    if "issuer" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN issuer TEXT"))
    if "certificate_issuer" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN certificate_issuer TEXT"))
            connection.execute(
                text(
                    "UPDATE warranty_items "
                    "SET certificate_issuer = issuer "
                    "WHERE certificate_issuer IS NULL AND issuer IS NOT NULL"
                )
            )
    if "note" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN note TEXT"))
    if "renewal_owner" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN renewal_owner TEXT"))
    if "renewal_responsible" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN renewal_responsible TEXT"))
    if "purchased_from" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN purchased_from TEXT"))
    if "brand" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN brand TEXT"))
    if "model" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN model TEXT"))
    if "serial_number" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN serial_number TEXT"))
    if "asset_tag" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN asset_tag TEXT"))
    if "service_code" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN service_code TEXT"))
    if "ordered_product_model" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN ordered_product_model TEXT"))
    if "price" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN price NUMERIC(14, 2)"))
    if "shipment_date" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN shipment_date DATE"))
    if "end_of_service_life" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN end_of_service_life DATE"))
    if "status" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN status TEXT"))
    if "reminder_days" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE warranty_items ADD COLUMN reminder_days INTEGER DEFAULT 30")
            )
    if "remind_days" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN remind_days INTEGER DEFAULT 30"))
            connection.execute(
                text(
                    "UPDATE warranty_items SET remind_days = reminder_days "
                    "WHERE remind_days IS NULL AND reminder_days IS NOT NULL"
                )
            )
    if "remind_days_before" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE warranty_items ADD COLUMN remind_days_before INTEGER DEFAULT 30")
            )
            connection.execute(
                text(
                    "UPDATE warranty_items "
                    "SET remind_days_before = reminder_days "
                    "WHERE remind_days_before IS NULL AND reminder_days IS NOT NULL"
                )
            )
    if "created_by_id" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN created_by_id INTEGER"))
            connection.execute(
                text(
                    "UPDATE warranty_items SET created_by_id = created_by_user_id "
                    "WHERE created_by_id IS NULL"
                )
            )
    if "updated_by_id" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN updated_by_id INTEGER"))
            connection.execute(
                text(
                    "UPDATE warranty_items SET updated_by_id = updated_by_user_id "
                    "WHERE updated_by_id IS NULL AND updated_by_user_id IS NOT NULL"
                )
            )
    if "created_by_user_id" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN created_by_user_id INTEGER"))
    if "updated_by_user_id" not in warranty_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE warranty_items ADD COLUMN updated_by_user_id INTEGER"))


def _apply_schema_upgrades() -> None:
    inspector = inspect(engine)
    is_postgres = engine.dialect.name == "postgresql"

    def ensure_timestamp_columns(table_name: str) -> None:
        if not inspector.has_table(table_name):
            return
        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
        column_type = "DATETIME" if is_sqlite else "TIMESTAMP"
        for column_name in ("created_at", "updated_at"):
            if column_name not in existing_columns:
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            f"ALTER TABLE {table_name} "
                            f"ADD COLUMN {column_name} {column_type} "
                            "DEFAULT CURRENT_TIMESTAMP"
                        )
                    )

    for table in ("users", "scenarios", "budget_items", "plan_entries", "expenses", "warranty_items"):
        ensure_timestamp_columns(table)

    if inspector.has_table("scenarios"):
        scenario_columns = {column["name"] for column in inspector.get_columns("scenarios")}
        with engine.begin() as connection:
            if "is_primary" not in scenario_columns:
                connection.execute(
                    text(
                        "ALTER TABLE scenarios ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT FALSE"
                        if is_postgres
                        else "ALTER TABLE scenarios ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT 0"
                    )
                )
                connection.execute(
                    text(
                        "UPDATE scenarios SET is_primary = "
                        + ("TRUE" if is_postgres else "1")
                        + " WHERE year IN ("
                        "SELECT year FROM scenarios GROUP BY year HAVING COUNT(*) = 1"
                        ") AND (is_primary IS NULL OR is_primary = "
                        + ("FALSE" if is_postgres else "0")
                        + ")"
                    )
                )
            connection.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_scenarios_primary_year "
                    "ON scenarios (year) WHERE is_primary IS TRUE"
                    if is_postgres
                    else "CREATE UNIQUE INDEX IF NOT EXISTS uq_scenarios_primary_year "
                    "ON scenarios (year) WHERE is_primary = 1"
                )
            )

    if inspector.has_table("budget_preparation_items"):
        item_columns = {column["name"] for column in inspector.get_columns("budget_preparation_items")}
        if "start_year" not in item_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE budget_preparation_items ADD COLUMN start_year INTEGER"))
                connection.execute(text(
                    "UPDATE budget_preparation_items SET start_year = ("
                    "SELECT year FROM budget_preparations "
                    "WHERE budget_preparations.id = budget_preparation_items.preparation_id"
                    ") WHERE start_year IS NULL"
                ))

    if inspector.has_table("budget_preparation_allocations"):
        allocation_columns = {
            column["name"] for column in inspector.get_columns("budget_preparation_allocations")
        }
        unique_names = {
            constraint.get("name")
            for constraint in inspector.get_unique_constraints("budget_preparation_allocations")
        }
        if is_sqlite and ("year" not in allocation_columns or "uq_preparation_item_month" in unique_names):
            year_expression = "COALESCE(old.year, preparation.year)" if "year" in allocation_columns else "preparation.year"
            with engine.begin() as connection:
                connection.execute(text("PRAGMA foreign_keys=OFF"))
                connection.execute(text("ALTER TABLE budget_preparation_allocations RENAME TO budget_preparation_allocations_legacy"))
                connection.execute(text(
                    "CREATE TABLE budget_preparation_allocations ("
                    "id INTEGER NOT NULL PRIMARY KEY, item_id INTEGER NOT NULL, year INTEGER NOT NULL, "
                    "month INTEGER NOT NULL, amount NUMERIC(16, 2) NOT NULL, "
                    "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                    "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                    "CONSTRAINT uq_preparation_item_year_month UNIQUE (item_id, year, month), "
                    "FOREIGN KEY(item_id) REFERENCES budget_preparation_items (id))"
                ))
                connection.execute(text(
                    "INSERT INTO budget_preparation_allocations "
                    "(id, item_id, year, month, amount, created_at, updated_at) "
                    f"SELECT old.id, old.item_id, {year_expression}, old.month, old.amount, "
                    "old.created_at, old.updated_at "
                    "FROM budget_preparation_allocations_legacy old "
                    "JOIN budget_preparation_items item ON item.id = old.item_id "
                    "JOIN budget_preparations preparation ON preparation.id = item.preparation_id"
                ))
                connection.execute(text("DROP TABLE budget_preparation_allocations_legacy"))
                connection.execute(text(
                    "CREATE INDEX ix_budget_preparation_allocations_item_id "
                    "ON budget_preparation_allocations (item_id)"
                ))
                connection.execute(text(
                    "CREATE INDEX ix_budget_preparation_allocations_year "
                    "ON budget_preparation_allocations (year)"
                ))
                connection.execute(text("PRAGMA foreign_keys=ON"))
        elif is_postgres:
            with engine.begin() as connection:
                if "year" not in allocation_columns:
                    connection.execute(text("ALTER TABLE budget_preparation_allocations ADD COLUMN year INTEGER"))
                    connection.execute(text(
                        "UPDATE budget_preparation_allocations allocation SET year = preparation.year "
                        "FROM budget_preparation_items item, budget_preparations preparation "
                        "WHERE allocation.item_id = item.id AND item.preparation_id = preparation.id"
                    ))
                    connection.execute(text("ALTER TABLE budget_preparation_allocations ALTER COLUMN year SET NOT NULL"))
                connection.execute(text(
                    "ALTER TABLE budget_preparation_allocations "
                    "DROP CONSTRAINT IF EXISTS uq_preparation_item_month"
                ))
                connection.execute(text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_preparation_item_year_month "
                    "ON budget_preparation_allocations (item_id, year, month)"
                ))

    if inspector.has_table("budget_items"):
        existing_columns = {column["name"] for column in inspector.get_columns("budget_items")}
        if "map_attribute" not in existing_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE budget_items ADD COLUMN map_attribute TEXT"))
        if "map_category" not in existing_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE budget_items ADD COLUMN map_category TEXT"))

    if inspector.has_table("expenses"):
        expense_column_info = {column["name"]: column for column in inspector.get_columns("expenses")}
        expense_columns = set(expense_column_info)
        if (
            is_postgres
            and "budget_item_id" in expense_column_info
            and not expense_column_info["budget_item_id"].get("nullable", True)
        ):
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE expenses ALTER COLUMN budget_item_id DROP NOT NULL"))
        if "client_hostname" not in expense_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE expenses ADD COLUMN client_hostname TEXT"))
        if "kaydi_giren_kullanici" not in expense_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE expenses ADD COLUMN kaydi_giren_kullanici TEXT"))
        for column_name in (
            "budget_outside_title",
            "budget_outside_department",
            "budget_outside_capex_opex",
            "budget_outside_asset_type",
        ):
            if column_name not in expense_columns:
                with engine.begin() as connection:
                    connection.execute(text(f"ALTER TABLE expenses ADD COLUMN {column_name} TEXT"))
        if "is_out_of_budget" not in expense_columns:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "ALTER TABLE expenses "
                        "ADD COLUMN is_out_of_budget BOOLEAN DEFAULT 0"
                        if is_postgres
                        else "ALTER TABLE expenses ADD COLUMN is_out_of_budget BOOLEAN DEFAULT 0"
                    )
                )
        if "created_by_id" not in expense_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE expenses ADD COLUMN created_by_id INTEGER"))
                connection.execute(
                    text(
                        "UPDATE expenses SET created_by_id = created_by_user_id "
                        "WHERE created_by_id IS NULL"
                    )
                )
        if "created_by_user_id" not in expense_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE expenses ADD COLUMN created_by_user_id INTEGER"))
                connection.execute(
                    text(
                        "UPDATE expenses SET created_by_user_id = created_by_id "
                        "WHERE created_by_user_id IS NULL"
                    )
                )
        if "updated_by_user_id" not in expense_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE expenses ADD COLUMN updated_by_user_id INTEGER"))
        if "updated_by_id" not in expense_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE expenses ADD COLUMN updated_by_id INTEGER"))
                connection.execute(
                    text(
                        "UPDATE expenses SET updated_by_id = COALESCE(updated_by_user_id, created_by_id) "
                        "WHERE updated_by_id IS NULL"
                    )
                )
        expense_columns = {column["name"] for column in inspect(engine).get_columns("expenses")}
        expense_column_definitions = {
            "funding_source": "VARCHAR(20) NOT NULL DEFAULT 'current'",
            "budget_source_year": "INTEGER",
            "is_periodic": "BOOLEAN NOT NULL DEFAULT FALSE" if is_postgres else "BOOLEAN NOT NULL DEFAULT 0",
            "period_start_year": "INTEGER",
            "period_start_month": "INTEGER",
            "period_month_count": "INTEGER",
        }
        for column_name, column_definition in expense_column_definitions.items():
            if column_name not in expense_columns:
                with engine.begin() as connection:
                    connection.execute(text(
                        f"ALTER TABLE expenses ADD COLUMN {column_name} {column_definition}"
                    ))

    if inspector.has_table("plan_entries"):
        plan_columns = {column["name"] for column in inspector.get_columns("plan_entries")}
        if "department" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE plan_entries ADD COLUMN department VARCHAR(100)"))
        if "budget_code" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE plan_entries ADD COLUMN budget_code TEXT"))
        if "purchase_requested" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE plan_entries ADD COLUMN purchase_requested BOOLEAN DEFAULT 0")
                )
        if "purchase_requested_at" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE plan_entries ADD COLUMN purchase_requested_at TIMESTAMP"))
        if "purchase_requested_by" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE plan_entries ADD COLUMN purchase_requested_by TEXT"))
        if "unused_amount" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(
                    text("ALTER TABLE plan_entries ADD COLUMN unused_amount FLOAT DEFAULT 0")
                )
        if "unused_reason" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE plan_entries ADD COLUMN unused_reason TEXT"))
        if "unused_note" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE plan_entries ADD COLUMN unused_note TEXT"))
        if "unused_updated_at" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE plan_entries ADD COLUMN unused_updated_at TIMESTAMP"))
        accrual_columns = {
            "accrual_group_id": "VARCHAR(36)",
            "accrual_amount": "NUMERIC(16, 2)",
            "accrual_source_year": "INTEGER",
            "accrual_source_month": "INTEGER",
            "accrual_source_plan_id": "INTEGER",
        }
        for column_name, column_type in accrual_columns.items():
            if column_name not in plan_columns:
                with engine.begin() as connection:
                    connection.execute(text(
                        f"ALTER TABLE plan_entries ADD COLUMN {column_name} {column_type}"
                    ))
        if "is_accrual" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(text(
                    "ALTER TABLE plan_entries ADD COLUMN is_accrual BOOLEAN NOT NULL DEFAULT FALSE"
                    if is_postgres
                    else "ALTER TABLE plan_entries ADD COLUMN is_accrual BOOLEAN NOT NULL DEFAULT 0"
                ))
        with engine.begin() as connection:
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_plan_entries_accrual_group_id "
                "ON plan_entries (accrual_group_id)"
            ))

    ensure_warranty_schema(inspector)

    if inspector.has_table("users"):
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "email" not in user_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE users ADD COLUMN email TEXT"))
        if "username" not in user_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE users ADD COLUMN username TEXT"))
                connection.execute(
                    text(
                        "UPDATE users SET username = CASE "
                        "WHEN username IS NULL OR username = '' THEN COALESCE(email, '') "
                        "ELSE username END"
                    )
                )
        if "is_admin" not in user_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"))
        if "role" not in user_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'"))
                connection.execute(
                    text("UPDATE users SET role = CASE WHEN is_admin THEN 'admin' ELSE 'user' END")
                )
        else:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE users SET role = CASE WHEN is_admin THEN 'admin' ELSE 'user' END "
                        "WHERE role IS NULL OR role = ''"
                    )
                )
