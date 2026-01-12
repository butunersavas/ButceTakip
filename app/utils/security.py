from datetime import datetime, timedelta
from hashlib import sha256
from typing import Optional

from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

# NOTE:
# ``passlib`` expects the third-party ``bcrypt`` package to expose an ``__about__``
# module containing the version information. Newer releases of ``bcrypt`` removed
# this attribute which causes an ``AttributeError`` during the lazy backend loading
# phase. Importing and patching the module here keeps ``passlib`` functional across
# the supported ``bcrypt`` versions without requiring a hard pin in every execution
# environment.
try:  # pragma: no cover - import-time patching
    import bcrypt as _bcrypt
except ImportError:  # pragma: no cover - bcrypt is an optional dependency
    _bcrypt = None
else:  # pragma: no branch - executed only when bcrypt is available
    if getattr(_bcrypt, "__about__", None) is None:
        from types import SimpleNamespace

        _bcrypt.__about__ = SimpleNamespace(
            __version__=getattr(_bcrypt, "__version__", "unknown"),
        )


pwd_context = CryptContext(
    schemes=["bcrypt_sha256", "bcrypt"],
    default="bcrypt_sha256",
    deprecated="auto",
)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
settings = get_settings()


class TokenData:
    def __init__(self, user_id: int, exp: datetime) -> None:
        self.user_id = user_id
        self.exp = exp


def _normalize_password(password: str) -> str:
    """Convert long passwords into a digest usable by bcrypt backends.

    The bcrypt algorithm rejects secrets longer than 72 bytes. We hash longer
    passwords with SHA-256 before delegating to passlib so that administrators can
    safely configure credentials of arbitrary length. Shorter passwords are left
    untouched to remain backward compatible with existing hashes.
    """

    password_bytes = password.encode("utf-8")
    if len(password_bytes) <= 72:
        return password
    return sha256(password_bytes).hexdigest()


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    if not hashed_password:
        return False
    try:
        return pwd_context.verify(_normalize_password(plain_password), hashed_password)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    return pwd_context.hash(_normalize_password(password))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta
        if expires_delta
        else timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def decode_access_token(token: str) -> TokenData:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = int(payload.get("sub"))
        exp = datetime.utcfromtimestamp(payload.get("exp"))
        return TokenData(user_id=user_id, exp=exp)
    except (JWTError, TypeError, ValueError):
        raise credentials_exception from None
