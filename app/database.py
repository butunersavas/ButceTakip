from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from .config import get_settings
from .models import User
from .utils.security import get_password_hash


settings = get_settings()
is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
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
    else:
        user.email = admin_email
        user.full_name = admin_full_name
        user.is_admin = True
        user.is_active = True
        user.hashed_password = hashed_password

    session.add(user)
    session.commit()
    session.refresh(user)


def _apply_schema_upgrades() -> None:
    inspector = inspect(engine)
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

    if inspector.has_table("plan_entries"):
        plan_columns = {column["name"] for column in inspector.get_columns("plan_entries")}
        if "department" not in plan_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE plan_entries ADD COLUMN department VARCHAR(100)"))

    if inspector.has_table("warranty_items"):
        warranty_columns = {column["name"] for column in inspector.get_columns("warranty_items")}
        if "created_by_user_id" not in warranty_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE warranty_items ADD COLUMN created_by_user_id INTEGER"))
        if "updated_by_user_id" not in warranty_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE warranty_items ADD COLUMN updated_by_user_id INTEGER"))

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
