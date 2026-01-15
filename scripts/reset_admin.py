import argparse
import logging

from sqlmodel import Session, select

from app.config import get_settings
from app.database import engine
from app.models import User
from app.utils.security import get_password_hash


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def reset_admin(
    email: str | None = None,
    password: str | None = None,
    full_name: str | None = None,
    username: str = "admin",
) -> User:
    settings = get_settings()
    admin_email = (email or settings.DEFAULT_ADMIN_EMAIL).strip().lower()
    admin_password = password or settings.DEFAULT_ADMIN_PASSWORD
    admin_full_name = full_name or settings.DEFAULT_ADMIN_FULL_NAME or "Admin Kullanıcı"

    if not admin_email:
        raise ValueError("DEFAULT_ADMIN_EMAIL boş olamaz.")

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
    parser.add_argument("--email", help="Admin e-posta adresi")
    parser.add_argument("--password", help="Admin parolası")
    parser.add_argument("--full-name", help="Admin tam adı")
    parser.add_argument("--username", default="admin", help="Admin kullanıcı adı")
    args = parser.parse_args()

    reset_admin(
        email=args.email,
        password=args.password,
        full_name=args.full_name,
        username=args.username,
    )


if __name__ == "__main__":
    main()
