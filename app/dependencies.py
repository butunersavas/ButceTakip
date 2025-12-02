from datetime import datetime

from fastapi import Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.models import User
from app.utils.security import decode_access_token, oauth2_scheme


def get_db_session() -> Session:
    with get_session() as session:
        yield session


def get_current_user(
    token: str = Depends(oauth2_scheme), session: Session = Depends(get_db_session)
) -> User:
    token_data = decode_access_token(token)
    user = session.get(User, token_data.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Ensure that the authenticated user has administrator privileges."""

    normalized_role = (current_user.role or "").strip().lower()
    if normalized_role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return current_user
