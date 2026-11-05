import argparse
import getpass
import logging

from sqlmodel import Session, select

from app.config import (
    KNOWN_UNSAFE_ADMIN_PASSWORD_HASHES,
    _fingerprint,
    _is_strong_admin_password,
    get_settings,
)
from app.database import engine
from app.models import User
from app.utils.security import get_password_hash


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def reset_admin(
    email: str,
    password: str,
    full_name: str | None = None,
    username: str = "admin",
) -> User:
    settings = get_settings()
    settings.validate_runtime_security()
    admin_email = email.strip().lower()
    admin_password = password
    admin_full_name = full_name or settings.DEFAULT_ADMIN_FULL_NAME or "Admin Kullanıcı"

    if not admin_email:
        raise ValueError("Admin e-posta adresi açıkça sağlanmalıdır.")
    if not admin_password or not admin_password.strip():
        raise ValueError("Admin parolası açıkça sağlanmalıdır.")
    if settings.is_production and (
        admin_email == "admin@local"
        or "@" not in admin_email
        or any(character.isspace() for character in admin_email)
        or not _is_strong_admin_password(admin_password)
        or _fingerprint(admin_password) in KNOWN_UNSAFE_ADMIN_PASSWORD_HASHES
    ):
        raise ValueError("Production admin kimlik bilgileri güvenlik gereksinimlerini karşılamıyor.")

    with Session(engine) as session:
        user = session.exec(
            select(User).where(
                (User.username == username)
                | (User.username == admin_email)
                | (User.email == admin_email)
            )
        ).first()

        hashed_password = get_password_hash(admin_password)

        if user is None:
            user = User(
                username=username,
                email=admin_email,
                full_name=admin_full_name,
                hashed_password=hashed_password,
                is_admin=True,
                is_active=True,
            )
            logger.info("Admin kullanıcı oluşturuldu: %s", admin_email)
        else:
            user.email = admin_email
            user.full_name = admin_full_name
            user.is_admin = True
            user.is_active = True
            user.hashed_password = hashed_password
            logger.info("Admin kullanıcı güncellendi: %s", admin_email)

        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def main() -> None:
    parser = argparse.ArgumentParser(description="Admin kullanıcısını oluştur veya şifresini sıfırla.")
    parser.add_argument("--email", required=True, help="Admin e-posta adresi")
    parser.add_argument("--full-name", help="Admin tam adı")
    parser.add_argument("--username", default="admin", help="Admin kullanıcı adı")
    args = parser.parse_args()
    password = getpass.getpass("Yeni admin parolası: ")

    reset_admin(
        email=args.email,
        password=password,
        full_name=args.full_name,
        username=args.username,
    )


if __name__ == "__main__":
    main()
