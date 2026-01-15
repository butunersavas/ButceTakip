from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.dependencies import get_admin_user, get_current_user, get_db_session
from app.models import User, WarrantyItem
from app.schemas import (
    WarrantyItemCreate,
    WarrantyItemCriticalRead,
    WarrantyItemRead,
    WarrantyItemUpdate,
)

router = APIRouter(prefix="/warranty-items", tags=["Warranty Items"])


def _calculate_days_left(end_date: date, today: date | None = None) -> int:
    base_date = today or date.today()
    return (end_date - base_date).days


def _calculate_status(days_left: int) -> str:
    if days_left < 0:
        return "Süresi Geçti"
    if days_left <= 30:
        return "Kritik"
    if days_left <= 60:
        return "Yaklaşıyor"
    return "Aktif"


def _user_display_name(user: User | None) -> str | None:
    if not user:
        return None
    return user.full_name or user.username or user.email


def _attach_user_names(session: Session, items: list[WarrantyItem]) -> None:
    user_ids: set[int] = set()
    for item in items:
        if item.created_by_id:
            user_ids.add(item.created_by_id)
        elif item.created_by_user_id:
            user_ids.add(item.created_by_user_id)
        if item.updated_by_id:
            user_ids.add(item.updated_by_id)
        elif item.updated_by_user_id:
            user_ids.add(item.updated_by_user_id)
    if not user_ids:
        return
    users = session.exec(select(User).where(User.id.in_(user_ids))).all()
    user_map = {user.id: _user_display_name(user) for user in users}
    for item in items:
        created_id = item.created_by_id or item.created_by_user_id
        updated_id = item.updated_by_id or item.updated_by_user_id
        item.created_by_name = user_map.get(created_id) if created_id else None
        item.updated_by_name = user_map.get(updated_id) if updated_id else None
        item.created_by_username = item.created_by_name
        item.updated_by_username = item.updated_by_name


def _attach_status_fields(items: list[WarrantyItem]) -> None:
    today = date.today()
    for item in items:
        days_left = _calculate_days_left(item.end_date, today)
        item.days_left = days_left
        item.status = _calculate_status(days_left)


@router.get("", response_model=list[WarrantyItemRead])
def list_warranty_items(
    include_inactive: bool = False,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[WarrantyItem]:
    statement = select(WarrantyItem)
    if not include_inactive:
        statement = statement.where(WarrantyItem.is_active.is_(True))
    items = session.exec(statement).all()
    _attach_user_names(session, items)
    _attach_status_fields(items)
    return items


@router.post("", response_model=WarrantyItemRead, status_code=status.HTTP_201_CREATED)
def create_warranty_item(
    item_in: WarrantyItemCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_admin_user),
) -> WarrantyItem:
    item = WarrantyItem(
        **item_in.dict(),
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    _attach_user_names(session, [item])
    _attach_status_fields([item])
    return item


@router.put("/{item_id}", response_model=WarrantyItemRead)
def update_warranty_item(
    item_id: int,
    item_in: WarrantyItemUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_admin_user),
) -> WarrantyItem:
    item = session.get(WarrantyItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warranty item not found")
    for field, value in item_in.dict(exclude_unset=True).items():
        setattr(item, field, value)
    if item.created_by_id is None:
        item.created_by_id = item.created_by_user_id
    item.updated_by_user_id = current_user.id
    item.updated_by_id = current_user.id
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    _attach_user_names(session, [item])
    _attach_status_fields([item])
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_warranty_item(
    item_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_admin_user),
) -> None:
    item = session.get(WarrantyItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warranty item not found")
    item.is_active = False
    item.updated_by_user_id = current_user.id
    item.updated_by_id = current_user.id
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    return None


@router.get("/critical", response_model=list[WarrantyItemCriticalRead])
def list_critical_warranty_items(
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[WarrantyItemCriticalRead]:
    active_items = session.exec(select(WarrantyItem).where(WarrantyItem.is_active.is_(True))).all()
    _attach_user_names(session, active_items)
    today = date.today()
    critical_items: list[WarrantyItemCriticalRead] = []
    for item in active_items:
        days_left = _calculate_days_left(item.end_date, today)
        if 1 <= days_left <= 30:
            critical_items.append(
                WarrantyItemCriticalRead(
                    id=item.id,
                    type=item.type,
                    name=item.name,
                    location=item.location,
                    end_date=item.end_date,
                    note=item.note,
                    issuer=item.issuer,
                    renewal_owner=item.renewal_owner,
                    reminder_days=item.reminder_days,
                    is_active=item.is_active,
                    created_by_id=item.created_by_id,
                    updated_by_id=item.updated_by_id,
                    created_by_user_id=item.created_by_user_id,
                    updated_by_user_id=item.updated_by_user_id,
                    created_by_name=getattr(item, "created_by_name", None),
                    updated_by_name=getattr(item, "updated_by_name", None),
                    created_by_username=getattr(item, "created_by_username", None),
                    updated_by_username=getattr(item, "updated_by_username", None),
                    status=_calculate_status(days_left),
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                    days_left=days_left,
                )
            )
    return critical_items
