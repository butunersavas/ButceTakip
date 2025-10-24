from contextlib import contextmanager
from typing import Iterator

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
    _ensure_default_admin()


@contextmanager
def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def _ensure_default_admin() -> None:
    if not settings.default_admin_email or not settings.default_admin_password:
        return

    with Session(engine) as session:
        existing_user = session.exec(
            select(User).where(User.email == settings.default_admin_email)
        ).first()
        if existing_user:
            return

        user = User(
            email=settings.default_admin_email,
            full_name=settings.default_admin_full_name,
            hashed_password=get_password_hash(settings.default_admin_password),
            role=settings.default_admin_role,
            is_active=True,
        )
        session.add(user)
        session.commit()
