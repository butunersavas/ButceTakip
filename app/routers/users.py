from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.dependencies import get_current_user, get_db_session
from app.models import User
from app.routers.auth import _create_user
from app.schemas import UserCreate, UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
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
