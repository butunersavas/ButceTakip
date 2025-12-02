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
        ensure_default_admin(session)


@contextmanager
def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def ensure_default_admin(session: Session) -> None:
    """Geliştirme/test ortamı için varsayılan admin kullanıcısını garanti eder."""

    if not settings.default_admin_email or not settings.default_admin_password:
        return

    normalized_email = settings.default_admin_email.strip().lower()
    normalized_role = (settings.default_admin_role or "admin").strip().lower() or "admin"

    user = session.exec(select(User).where(User.email == normalized_email)).first()

    if user is not None:
        # Admin hesabı yanlış veya büyük/küçük harf hassasiyeti farklı bir rol ile
        # oluşturulmuşsa düzeltelim.
        stored_normalized_role = (user.role or "").strip().lower()
        if stored_normalized_role != normalized_role or user.role != normalized_role:
            user.role = normalized_role
            session.add(user)
            session.commit()
            session.refresh(user)
        return

    user = User(
        email=normalized_email,
        full_name=settings.default_admin_full_name,
        hashed_password=get_password_hash(settings.default_admin_password),
        role=normalized_role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)


def _apply_schema_upgrades() -> None:
    inspector = inspect(engine)
    existing_columns = {column["name"] for column in inspector.get_columns("budget_items")}
    if "map_attribute" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE budget_items ADD COLUMN map_attribute TEXT"))
    if "map_category" not in existing_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE budget_items ADD COLUMN map_category TEXT"))

    expense_columns = {column["name"] for column in inspector.get_columns("expenses")}
    if "client_hostname" not in expense_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE expenses ADD COLUMN client_hostname TEXT"))
    if "kaydi_giren_kullanici" not in expense_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE expenses ADD COLUMN kaydi_giren_kullanici TEXT"))
