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
    _ensure_default_admin()


@contextmanager
def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def _ensure_default_admin() -> None:
    if not settings.default_admin_email or not settings.default_admin_password:
        return

    admin_email = settings.default_admin_email.strip()
    admin_password = settings.default_admin_password.strip()
    admin_full_name = settings.default_admin_full_name.strip() or "Admin Kullanıcı"
    admin_role = settings.default_admin_role.strip() or "admin"

    if not admin_email or not admin_password:
        return

    with Session(engine) as session:
        existing_user = session.exec(select(User).where(User.email == admin_email)).first()
        if existing_user:
            return

        user = User(
            email=admin_email,
            full_name=admin_full_name,
            hashed_password=get_password_hash(admin_password),
            role=admin_role,
            is_active=True,
        )
        session.add(user)
        session.commit()


def _apply_schema_upgrades() -> None:
    inspector = inspect(engine)
    existing_columns = {column["name"] for column in inspector.get_columns("budget_items")}
    if "map_attribute" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE budget_items ADD COLUMN map_attribute TEXT"))
    if "map_category" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE budget_items ADD COLUMN map_category TEXT"))
