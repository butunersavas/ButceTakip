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
engine = create_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=not is_sqlite,
    connect_args=connect_args,
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _apply_schema_upgrades()
    with Session(engine) as session:
        init_default_admin(session)


@contextmanager
def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def init_default_admin(session: Session) -> None:
    """Create or update the default admin user based on environment variables."""

    admin_username = "admin"
    admin_email = settings.DEFAULT_ADMIN_EMAIL.strip().lower()
    admin_full_name = settings.DEFAULT_ADMIN_FULL_NAME or "Admin Kullanıcı"
    admin_password = settings.DEFAULT_ADMIN_PASSWORD

    if not admin_email:
        return

    user = session.exec(
        select(User).where(
            (User.username == admin_username)
            | (User.username == admin_email)
            | (User.email == admin_email)
        )
    ).first()
    hashed_password = get_password_hash(admin_password)

    if user is None:
        user = User(
            username=admin_username,
            email=admin_email,
            full_name=admin_full_name,
            hashed_password=hashed_password,
            is_admin=True,
            role="admin",
            is_active=True,
        )
        logger.info("Default admin created.")
    else:
        user.email = admin_email
        user.full_name = admin_full_name
        user.is_admin = True
        user.role = "admin"
        user.is_active = True
        user.hashed_password = hashed_password
        logger.info("Default admin exists.")

    session.add(user)
    session.commit()
    session.refresh(user)


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
                    "UPDATE warranty_items SET updated_by_id = COALESCE(updated_by_user_id, created_by_id) "
                    "WHERE updated_by_id IS NULL"
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
