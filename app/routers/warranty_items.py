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


@router.get("", response_model=list[WarrantyItemRead])
def list_warranty_items(
    include_inactive: bool = False,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[WarrantyItem]:
    statement = select(WarrantyItem)
    if not include_inactive:
        statement = statement.where(WarrantyItem.is_active.is_(True))
    return session.exec(statement).all()


@router.post("", response_model=WarrantyItemRead, status_code=status.HTTP_201_CREATED)
def create_warranty_item(
    item_in: WarrantyItemCreate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> WarrantyItem:
    item = WarrantyItem(**item_in.dict())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.put("/{item_id}", response_model=WarrantyItemRead)
def update_warranty_item(
    item_id: int,
    item_in: WarrantyItemUpdate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> WarrantyItem:
    item = session.get(WarrantyItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warranty item not found")
    for field, value in item_in.dict(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_warranty_item(
    item_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> None:
    item = session.get(WarrantyItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warranty item not found")
    item.is_active = False
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
                    is_active=item.is_active,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                    days_left=days_left,
                )
            )
    return critical_items
