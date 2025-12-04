from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from app.config import get_settings
from app.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas import CurrentUserResponse, Token, UserCreate, UserRead
from app.utils.security import create_access_token, get_password_hash, verify_password
from app.utils.validators import validate_username

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def authenticate_user(session: Session, username: str, password: str) -> User | None:
    normalized_username = username.strip().lower()
    user = session.exec(select(User).where(User.username == normalized_username)).first()
    if not user:
        return None
    if not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def _create_user(session: Session, user_in: UserCreate) -> User:
    validate_username(user_in.username, user_in.is_admin)
    username = user_in.username.strip().lower()

    existing_user = session.exec(select(User).where(User.username == username)).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu kullanıcı adı zaten mevcut.")

    user = User(
        username=username,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        is_admin=user_in.is_admin,
        is_active=user_in.is_active if user_in.is_active is not None else True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register_user(
    user_in: UserCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yeni kullanıcı oluşturma yetkiniz yok (sadece admin).",
        )

    return _create_user(session, user_in)


@router.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_db_session),
) -> Token:
    user = authenticate_user(session, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": str(user.id), "is_admin": user.is_admin},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return Token(access_token=access_token)


@router.get("/me", response_model=CurrentUserResponse)
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    """Return the authenticated user's profile information."""
    return current_user
