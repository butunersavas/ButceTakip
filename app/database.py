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
            is_active=True,
        )
        logger.info("Default admin created.")
    else:
        user.email = admin_email
        user.full_name = admin_full_name
        user.is_admin = True
        user.is_active = True
        user.hashed_password = hashed_password
        logger.info("Default admin exists.")

    session.add(user)
    session.commit()
    session.refresh(user)


def ensure_warranty_schema(inspector) -> None:
    if not inspector.has_table("warranty_items"):
        return
    warranty_columns = {column["name"] for column in inspector.get_columns("warranty_items")}
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
        expense_columns = {column["name"] for column in inspector.get_columns("expenses")}
        if "client_hostname" not in expense_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE expenses ADD COLUMN client_hostname TEXT"))
        if "kaydi_giren_kullanici" not in expense_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE expenses ADD COLUMN kaydi_giren_kullanici TEXT"))
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
