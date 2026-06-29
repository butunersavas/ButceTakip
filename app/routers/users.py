from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import Session, select

from app.dependencies import get_admin_user, get_db_session
from app.models import User
from app.routers.auth import _create_user
from app.schemas import UserCreate, UserRead, UserUpdate
from app.utils.security import get_password_hash

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


@router.put("/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    user_in: UserUpdate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> User:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    if user_in.full_name is not None:
        user.full_name = user_in.full_name

    if user_in.is_active is not None:
        user.is_active = user_in.is_active

    if user_in.is_admin is not None:
        user.is_admin = user_in.is_admin
        if user_in.is_admin:
            user.role = "admin"
        elif user.role == "admin":
            user.role = "user"

    if user_in.role is not None:
        role = "viewer" if user_in.role in {"readonly", "read_only"} else user_in.role
        user.role = role
        user.is_admin = role == "admin"

    if user_in.password:
        user.hashed_password = get_password_hash(user_in.password)

    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_admin_user),
) -> None:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Kendi kullanıcınızı silemezsiniz.")

    try:
        session.delete(user)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kullanıcı bağlı kayıtlar olduğu için silinemedi.",
        )
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Kullanıcı silinirken beklenmedik bir hata oluştu.",
        )
    return None
