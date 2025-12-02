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

    normalized_email = "admin@example.com"

    user = session.exec(select(User).where(User.email == normalized_email)).first()

    if user is None:
        # Kullanıcı yoksa yeni admin oluştur
        user = User(
            email=normalized_email,
            full_name="Admin Kullanıcı",
            hashed_password=get_password_hash("Admin123!"),
        )
        # Eğer User modelinde role alanı varsa admin yap
        if hasattr(user, "role"):
            setattr(user, "role", "admin")

        session.add(user)
        session.commit()
        session.refresh(user)
    else:
        # Kullanıcı varsa şifresini Admin123! olarak resetle
        user.hashed_password = get_password_hash("Admin123!")
        # role alanı varsa admin olarak güncelle
        if hasattr(user, "role"):
            setattr(user, "role", "admin")

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

    expense_columns = {column["name"] for column in inspector.get_columns("expenses")}
    if "client_hostname" not in expense_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE expenses ADD COLUMN client_hostname TEXT"))
    if "kaydi_giren_kullanici" not in expense_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE expenses ADD COLUMN kaydi_giren_kullanici TEXT"))
