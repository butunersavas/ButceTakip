from datetime import date, datetime

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import aliased
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
logger = logging.getLogger(__name__)


def _calculate_days_left(end_date: date | None, today: date | None = None) -> int | None:
    if end_date is None:
        return None
    base_date = today or date.today()
    return (end_date - base_date).days


def _calculate_status(days_left: int | None) -> str | None:
    if days_left is None:
        return None
    if days_left < 0:
        return "Süresi Geçti"
    if days_left <= 30:
        return "Kritik"
    if days_left <= 60:
        return "Yaklaşıyor"
    return "Aktif"


def _resolve_remind_days(item: WarrantyItem) -> int:
    if isinstance(item.remind_days, int):
        return item.remind_days
    if isinstance(item.remind_days_before, int):
        return item.remind_days_before
    if isinstance(item.reminder_days, int):
        return item.reminder_days
    return 30


def _user_display_name(user: User | None) -> str | None:
    if not user:
        return None
    return user.full_name or user.username or user.email


def _normalize_output_text(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    cleaned = value.strip()
    if not cleaned or cleaned in {"-", "—"}:
        return None
    return cleaned


def _build_user_map(session: Session, items: list[WarrantyItem]) -> dict[int, str | None]:
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
        return {}
    users = session.exec(select(User).where(User.id.in_(user_ids))).all()
    return {user.id: _user_display_name(user) for user in users}


def _build_warranty_read(
    item: WarrantyItem,
    created_name: str | None,
    updated_name: str | None,
) -> WarrantyItemRead:
    read_item = WarrantyItemRead.from_orm(item)
    read_item.created_by_name = _normalize_output_text(created_name)
    read_item.updated_by_name = _normalize_output_text(updated_name)
    read_item.created_by_username = read_item.created_by_name
    read_item.updated_by_username = read_item.updated_by_name
    read_item.domain = _normalize_output_text(read_item.domain)
    read_item.note = _normalize_output_text(read_item.note)
    read_item.issuer = _normalize_output_text(read_item.issuer)
    read_item.certificate_issuer = _normalize_output_text(read_item.certificate_issuer)
    read_item.renewal_owner = _normalize_output_text(read_item.renewal_owner)
    read_item.renewal_responsible = _normalize_output_text(read_item.renewal_responsible)
    remind_days_before = _resolve_remind_days(item)
    if read_item.remind_days_before is None:
        read_item.remind_days_before = remind_days_before
    if read_item.remind_days is None:
        read_item.remind_days = remind_days_before
    if read_item.reminder_days is None:
        read_item.reminder_days = remind_days_before
    if read_item.certificate_issuer is None and read_item.issuer:
        read_item.certificate_issuer = read_item.issuer
    if read_item.issuer is None and read_item.certificate_issuer:
        read_item.issuer = read_item.certificate_issuer
    if read_item.renewal_responsible is None and read_item.renewal_owner:
        read_item.renewal_responsible = read_item.renewal_owner
    if read_item.renewal_owner is None and read_item.renewal_responsible:
        read_item.renewal_owner = read_item.renewal_responsible
    days_left = _calculate_days_left(item.end_date)
    read_item.days_left = days_left
    read_item.status = _calculate_status(days_left)
    return read_item


@router.get("", response_model=list[WarrantyItemRead])
@router.get("/", response_model=list[WarrantyItemRead], include_in_schema=False)
def list_warranty_items(
    include_inactive: bool = False,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[WarrantyItemRead]:
    created_user = aliased(User)
    updated_user = aliased(User)
    statement = (
        select(
            WarrantyItem,
            created_user.full_name.label("created_full_name"),
            created_user.username.label("created_username"),
            created_user.email.label("created_email"),
            updated_user.full_name.label("updated_full_name"),
            updated_user.username.label("updated_username"),
            updated_user.email.label("updated_email"),
        )
        .select_from(WarrantyItem)
        .outerjoin(
            created_user,
            created_user.id == func.coalesce(WarrantyItem.created_by_user_id, WarrantyItem.created_by_id),
        )
        .outerjoin(
            updated_user,
            updated_user.id == func.coalesce(WarrantyItem.updated_by_user_id, WarrantyItem.updated_by_id),
        )
    )
    if not include_inactive:
        statement = statement.where(WarrantyItem.is_active.is_(True))
    rows = session.exec(statement).all()
    items: list[WarrantyItemRead] = []
    for row in rows:
        item = row[0]
        created_name = row.created_full_name or row.created_username or row.created_email
        updated_name = row.updated_full_name or row.updated_username or row.updated_email
        items.append(_build_warranty_read(item, created_name, updated_name))
    return items


@router.post("", response_model=WarrantyItemRead, status_code=status.HTTP_201_CREATED)
@router.post(
    "/",
    response_model=WarrantyItemRead,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def create_warranty_item(
    item_in: WarrantyItemCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_admin_user),
) -> WarrantyItemRead:
    item_data = item_in.dict()
    logger.debug("Warranty item create payload: %s", item_data)
    if item_data.get("end_date") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date is required",
        )
    if item_data.get("certificate_issuer") and not item_data.get("issuer"):
        item_data["issuer"] = item_data["certificate_issuer"]
    if item_data.get("renewal_responsible") and not item_data.get("renewal_owner"):
        item_data["renewal_owner"] = item_data["renewal_responsible"]
    if item_data.get("renewal_owner") and not item_data.get("renewal_responsible"):
        item_data["renewal_responsible"] = item_data["renewal_owner"]
    reminder_value = item_data.get("reminder_days")
    if reminder_value is not None:
        item_data.setdefault("remind_days_before", reminder_value)
        item_data.setdefault("remind_days", reminder_value)
    remind_days_value = item_data.get("remind_days") or item_data.get("remind_days_before")
    if remind_days_value is not None:
        item_data.setdefault("remind_days_before", remind_days_value)
        item_data.setdefault("reminder_days", remind_days_value)
        item_data.setdefault("remind_days", remind_days_value)
    item = WarrantyItem(
        **item_data,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
    )
    try:
        session.add(item)
        session.commit()
        session.refresh(item)
    except SQLAlchemyError as exc:
        logger.exception("Failed to create warranty item")
        session.rollback()
        detail = str(exc.orig) if getattr(exc, "orig", None) else "DB constraint error"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )
    user_map = _build_user_map(session, [item])
    created_id = item.created_by_id or item.created_by_user_id
    updated_id = item.updated_by_id or item.updated_by_user_id
    return _build_warranty_read(
        item,
        user_map.get(created_id) if created_id else None,
        user_map.get(updated_id) if updated_id else None,
    )


@router.put("/{item_id}", response_model=WarrantyItemRead)
@router.put("/{item_id}/", response_model=WarrantyItemRead, include_in_schema=False)
def update_warranty_item(
    item_id: int,
    item_in: WarrantyItemUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_admin_user),
) -> WarrantyItemRead:
    item = session.get(WarrantyItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Warranty item not found")
    update_data = item_in.dict(exclude_unset=True)
    if update_data.get("certificate_issuer") and not update_data.get("issuer"):
        update_data["issuer"] = update_data["certificate_issuer"]
    if update_data.get("renewal_responsible") and not update_data.get("renewal_owner"):
        update_data["renewal_owner"] = update_data["renewal_responsible"]
    if update_data.get("renewal_owner") and not update_data.get("renewal_responsible"):
        update_data["renewal_responsible"] = update_data["renewal_owner"]
    reminder_value = update_data.get("reminder_days")
    if reminder_value is not None:
        update_data.setdefault("remind_days_before", reminder_value)
        update_data.setdefault("remind_days", reminder_value)
    remind_days_value = update_data.get("remind_days") or update_data.get("remind_days_before")
    if remind_days_value is not None:
        update_data.setdefault("remind_days_before", remind_days_value)
        update_data.setdefault("reminder_days", remind_days_value)
        update_data.setdefault("remind_days", remind_days_value)
    for field, value in update_data.items():
        setattr(item, field, value)
    if item.created_by_id is None:
        item.created_by_id = item.created_by_user_id
    item.updated_by_user_id = current_user.id
    item.updated_by_id = current_user.id
    item.updated_at = datetime.utcnow()
    try:
        session.add(item)
        session.commit()
        session.refresh(item)
    except SQLAlchemyError:
        logger.exception("Failed to update warranty item", extra={"item_id": item_id})
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Garanti kaydı güncellenemedi.",
        )
    user_map = _build_user_map(session, [item])
    created_id = item.created_by_id or item.created_by_user_id
    updated_id = item.updated_by_id or item.updated_by_user_id
    return _build_warranty_read(
        item,
        user_map.get(created_id) if created_id else None,
        user_map.get(updated_id) if updated_id else None,
    )


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{item_id}/", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
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
    try:
        session.add(item)
        session.commit()
    except SQLAlchemyError:
        logger.exception("Failed to delete warranty item", extra={"item_id": item_id})
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Garanti kaydı silinemedi.",
        )
    return None


@router.get("/critical", response_model=list[WarrantyItemCriticalRead])
@router.get("/critical/", response_model=list[WarrantyItemCriticalRead], include_in_schema=False)
def list_critical_warranty_items(
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[WarrantyItemCriticalRead]:
    active_items = session.exec(select(WarrantyItem).where(WarrantyItem.is_active.is_(True))).all()
    user_map = _build_user_map(session, active_items)
    today = date.today()
    critical_items: list[WarrantyItemCriticalRead] = []
    for item in active_items:
        days_left = _calculate_days_left(item.end_date, today)
        if days_left is None:
            continue
        remind_days_before = _resolve_remind_days(item)
        if 0 <= days_left <= remind_days_before:
            created_id = item.created_by_id or item.created_by_user_id
            updated_id = item.updated_by_id or item.updated_by_user_id
            critical_items.append(
                WarrantyItemCriticalRead(
                    id=item.id,
                    type=item.type,
                    name=item.name,
                    location=item.location,
                    domain=item.domain,
                    end_date=item.end_date,
                    note=item.note,
                    issuer=item.issuer or item.certificate_issuer,
                    certificate_issuer=item.certificate_issuer or item.issuer,
                    renewal_owner=item.renewal_owner,
                    renewal_responsible=item.renewal_responsible or item.renewal_owner,
                    reminder_days=item.reminder_days or item.remind_days or item.remind_days_before or 30,
                    remind_days_before=item.remind_days_before
                    or item.remind_days
                    or item.reminder_days
                    or 30,
                    is_active=item.is_active,
                    created_by_id=item.created_by_id,
                    updated_by_id=item.updated_by_id,
                    created_by_user_id=item.created_by_user_id,
                    updated_by_user_id=item.updated_by_user_id,
                    created_by_name=user_map.get(created_id) if created_id else None,
                    updated_by_name=user_map.get(updated_id) if updated_id else None,
                    created_by_username=user_map.get(created_id) if created_id else None,
                    updated_by_username=user_map.get(updated_id) if updated_id else None,
                    status=_calculate_status(days_left),
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                    days_left=days_left,
                )
            )
    return critical_items
