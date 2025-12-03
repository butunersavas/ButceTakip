from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from app.dependencies import get_admin_user, get_db_session
from app.models import User
from app.routers.auth import _create_user
from app.schemas import UserCreate, UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead])
def list_users(
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> list[User]:
    return session.exec(select(User)).all()


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    user_in: UserCreate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> User:
    return _create_user(session, user_in)
