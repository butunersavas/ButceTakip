from datetime import timedelta
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, select

from app.config import get_settings
from app.dependencies import get_current_user, get_db_session
from app.models import User
from app.schemas import ChangePasswordRequest, CurrentUserResponse, Token, UserCreate, UserRead
from app.utils.security import create_access_token, get_password_hash, verify_password
from app.utils.validators import validate_username

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    username: str
    password: str


def authenticate_user(session: Session, username: str, password: str) -> User | None:
    normalized_username = username.strip().lower()
    user = session.exec(select(User).where(User.email == normalized_username)).first()
    if not user:
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
@router.post(
    "/register/",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
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
@router.post("/token/", response_model=Token, include_in_schema=False)
async def login_for_access_token(
    request: Request,
    session: Session = Depends(get_db_session),
) -> Token:
    try:
        content_type = request.headers.get("content-type", "")
        is_json = content_type.split(";")[0].strip().lower() == "application/json"
        if is_json:
            try:
                payload = await request.json()
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Geçersiz JSON gövdesi.",
                )
            try:
                login_data = LoginRequest(**payload)
            except ValidationError as exc:
                logger.info("Login validation failed: %s", exc.errors())
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kullanıcı adı ve şifre zorunludur.",
                )
        else:
            form = await request.form()
            try:
                form_data = OAuth2PasswordRequestForm(
                    username=form.get("username"),
                    password=form.get("password"),
                    scope=form.get("scope", "") or "",
                    grant_type=form.get("grant_type"),
                    client_id=form.get("client_id"),
                    client_secret=form.get("client_secret"),
                )
            except TypeError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kullanıcı adı ve şifre zorunludur.",
                )
            try:
                login_data = LoginRequest(username=form_data.username, password=form_data.password)
            except ValidationError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kullanıcı adı ve şifre zorunludur.",
                )

        user = authenticate_user(session, login_data.username, login_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Kullanıcı adı veya şifre hatalı",
                headers={"WWW-Authenticate": "Bearer"},
            )
        access_token = create_access_token(
            data={"sub": str(user.id), "is_admin": user.is_admin},
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        )
        return Token(access_token=access_token)
    except HTTPException:
        raise
    except SQLAlchemyError:
        logger.exception("Token endpoint failed due to database error")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Database error",
        )
    except Exception:
        logger.exception("Token endpoint failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.post("/change-password")
@router.post("/change-password/", include_in_schema=False)
def change_password(
    data: ChangePasswordRequest,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mevcut şifre hatalı.")

    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Yeni şifre en az 8 karakter olmalıdır.",
        )

    current_user.hashed_password = get_password_hash(data.new_password)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)

    return {"detail": "Şifreniz başarıyla güncellendi."}


@router.get("/me", response_model=CurrentUserResponse)
@router.get("/me/", response_model=CurrentUserResponse, include_in_schema=False)
def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    """Return the authenticated user's profile information."""
    return current_user
