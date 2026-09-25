from datetime import datetime
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session, get_write_user
from app.models import (
    BudgetItem,
    BudgetPreparation,
    BudgetPreparationAllocation,
    BudgetPreparationItem,
    PlanEntry,
    Scenario,
    User,
)
from app.schemas import (
    BudgetPreparationCarryoverRead,
    BudgetPreparationCompleteRead,
    BudgetPreparationCreate,
    BudgetPreparationItemInput,
    BudgetPreparationItemRead,
    BudgetPreparationMetadataRead,
    BudgetPreparationRead,
    BudgetPreparationUpdate,
)
from app.services.budget_preparation import (
    activate_preparation,
    build_item_read,
    build_preparation_read,
    discover_carryovers,
    matching_carryovers,
    money,
    replace_allocations,
)

router = APIRouter(prefix="/budget-preparations", tags=["Budget Preparations"])

DEFAULT_DEPARTMENTS = ("Sistem", "Teknik")
DEFAULT_ATTRIBUTES = ("Bakım", "Danışmanlık", "Donanım", "Hizmet", "Yazılım")


def _canonical_values(defaults: tuple[str, ...], values: list[str | None]) -> list[str]:
    canonical: dict[str, str] = {value.casefold(): value for value in defaults}
    for raw in values:
        value = (raw or "").strip()
        if value:
            canonical.setdefault(value.casefold(), value)
    return sorted(canonical.values(), key=lambda value: value.casefold())


def _canonicalize_choice(value: str | None, choices: list[str]) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return next((choice for choice in choices if choice.casefold() == normalized.casefold()), normalized)


def _canonicalize_item_metadata(
    session: Session, payload: BudgetPreparationItemInput
) -> BudgetPreparationItemInput:
    metadata = get_metadata(session, None)  # type: ignore[arg-type]
    return payload.copy(update={
        "department": _canonicalize_choice(payload.department, metadata.departments),
        "map_attribute": _canonicalize_choice(payload.map_attribute, metadata.attributes),
    })


def _get_preparation(session: Session, preparation_id: int) -> BudgetPreparation:
    preparation = session.get(BudgetPreparation, preparation_id)
    if not preparation:
        raise HTTPException(status_code=404, detail="Bütçe taslağı bulunamadı.")
    return preparation


def _ensure_draft(preparation: BudgetPreparation) -> None:
    if preparation.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bu bütçe planlanmıştır. Hazırlama ekranından düzenlenemez.",
        )


def _get_item(
    session: Session, preparation_id: int, item_id: int
) -> BudgetPreparationItem:
    item = session.get(BudgetPreparationItem, item_id)
    if not item or item.preparation_id != preparation_id:
        raise HTTPException(status_code=404, detail="Bütçe kalemi bulunamadı.")
    return item


@router.get("/metadata", response_model=BudgetPreparationMetadataRead)
def get_metadata(
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> BudgetPreparationMetadataRead:
    departments = session.exec(
        select(PlanEntry.department)
        .where(PlanEntry.department.is_not(None))
        .distinct()
    ).all()
    attributes = session.exec(
        select(BudgetItem.map_attribute)
        .where(BudgetItem.map_attribute.is_not(None))
        .distinct()
    ).all()
    preparation_departments = session.exec(
        select(BudgetPreparationItem.department)
        .where(BudgetPreparationItem.department.is_not(None))
        .distinct()
    ).all()
    preparation_attributes = session.exec(
        select(BudgetPreparationItem.map_attribute)
        .where(BudgetPreparationItem.map_attribute.is_not(None))
        .distinct()
    ).all()
    return BudgetPreparationMetadataRead(
        departments=_canonical_values(DEFAULT_DEPARTMENTS, [*departments, *preparation_departments]),
        attributes=_canonical_values(DEFAULT_ATTRIBUTES, [*attributes, *preparation_attributes]),
    )


@router.get("", response_model=list[BudgetPreparationRead])
@router.get("/", response_model=list[BudgetPreparationRead], include_in_schema=False)
def list_preparations(
    search: str | None = Query(default=None),
    year: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[BudgetPreparationRead]:
    query = select(BudgetPreparation)
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        matching_ids = select(BudgetPreparationItem.preparation_id).where(
            or_(
                func.lower(BudgetPreparationItem.budget_name).like(term),
                func.lower(BudgetPreparationItem.budget_code).like(term),
            )
        )
        query = query.where(
            or_(func.lower(BudgetPreparation.name).like(term), BudgetPreparation.id.in_(matching_ids))
        )
    if year is not None:
        query = query.where(BudgetPreparation.year == year)
    if status_filter:
        query = query.where(BudgetPreparation.status == status_filter.upper())
    rows = session.exec(query.order_by(BudgetPreparation.updated_at.desc())).all()
    return [build_preparation_read(session, row, include_items=False) for row in rows]


@router.get("/carryovers", response_model=list[BudgetPreparationCarryoverRead])
def list_carryovers(
    year: int = Query(..., ge=2000, le=2200),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[BudgetPreparationCarryoverRead]:
    return discover_carryovers(session, year)


@router.post("", response_model=BudgetPreparationRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=BudgetPreparationRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_preparation(
    payload: BudgetPreparationCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> BudgetPreparationRead:
    preparation = BudgetPreparation(
        **payload.dict(), status="DRAFT", created_by_id=current_user.id
    )
    session.add(preparation)
    session.commit()
    session.refresh(preparation)
    return build_preparation_read(session, preparation)


@router.get("/{preparation_id}", response_model=BudgetPreparationRead)
def get_preparation(
    preparation_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> BudgetPreparationRead:
    return build_preparation_read(session, _get_preparation(session, preparation_id))


@router.post("/{preparation_id}/revision", response_model=BudgetPreparationRead, status_code=201)
def create_revision(
    preparation_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_write_user),
) -> BudgetPreparationRead:
    source = _get_preparation(session, preparation_id)
    if source.status != "ACTIVE":
        raise HTTPException(status_code=409, detail="Yalnız planlanmış bütçeden revizyon oluşturulabilir.")
    base_name = re.sub(r" - Revizyon \d+$", "", source.name).strip()
    prefix = f"{base_name} - Revizyon "
    existing_names = session.exec(
        select(BudgetPreparation.name).where(BudgetPreparation.year == source.year)
    ).all()
    revision_number = 1
    while f"{prefix}{revision_number}" in existing_names:
        revision_number += 1
    revision = BudgetPreparation(
        year=source.year,
        name=f"{prefix}{revision_number}",
        currency=source.currency,
        note=source.note,
        status="DRAFT",
        created_by_id=current_user.id,
    )
    session.add(revision)
    session.flush()
    source_items = session.exec(
        select(BudgetPreparationItem).where(BudgetPreparationItem.preparation_id == source.id)
    ).all()
    for source_item in source_items:
        clone = BudgetPreparationItem(
            preparation_id=revision.id,
            budget_name=source_item.budget_name,
            budget_code=source_item.budget_code,
            total_amount=source_item.total_amount,
            currency=source_item.currency,
            capex_opex=source_item.capex_opex,
            department=source_item.department,
            map_attribute=source_item.map_attribute,
            description=source_item.description,
            distribution_method=source_item.distribution_method,
            single_month=source_item.single_month,
            start_year=source_item.start_year,
            start_month=source_item.start_month,
            month_count=source_item.month_count,
            source_year=source_item.source_year or source.year,
            source_plan_id=source_item.source_plan_id,
            source_budget_item_id=source_item.source_budget_item_id,
            is_carryover=source_item.is_carryover,
        )
        session.add(clone)
        session.flush()
        allocations = session.exec(
            select(BudgetPreparationAllocation).where(
                BudgetPreparationAllocation.item_id == source_item.id
            )
        ).all()
        for allocation in allocations:
            session.add(BudgetPreparationAllocation(
                item_id=clone.id,
                year=allocation.year,
                month=allocation.month,
                amount=allocation.amount,
            ))
    session.commit()
    session.refresh(revision)
    return build_preparation_read(session, revision)


@router.post("/{preparation_id}/primary", response_model=BudgetPreparationRead)
def make_primary(
    preparation_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_write_user),
) -> BudgetPreparationRead:
    preparation = _get_preparation(session, preparation_id)
    if preparation.status != "ACTIVE" or not preparation.activated_scenario_id:
        raise HTTPException(status_code=409, detail="Yalnız planlanmış bütçe Ana Bütçe yapılabilir.")
    selected = session.exec(
        select(Scenario)
        .where(Scenario.id == preparation.activated_scenario_id)
        .with_for_update()
    ).first()
    if not selected:
        raise HTTPException(status_code=404, detail="Bütçe Scenario kaydı bulunamadı.")
    year_scenarios = session.exec(
        select(Scenario).where(Scenario.year == selected.year).with_for_update()
    ).all()
    try:
        for scenario in year_scenarios:
            scenario.is_primary = scenario.id == selected.id
            scenario.updated_at = datetime.utcnow()
            session.add(scenario)
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Bu yıl için Ana Bütçe eşzamanlı olarak güncellendi.") from exc
    return build_preparation_read(session, preparation)


@router.put("/{preparation_id}", response_model=BudgetPreparationRead)
def update_preparation(
    preparation_id: int,
    payload: BudgetPreparationUpdate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_write_user),
) -> BudgetPreparationRead:
    preparation = _get_preparation(session, preparation_id)
    _ensure_draft(preparation)
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(preparation, field, value)
    preparation.updated_at = datetime.utcnow()
    session.add(preparation)
    session.commit()
    session.refresh(preparation)
    return build_preparation_read(session, preparation)


@router.delete("/{preparation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_preparation(
    preparation_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_write_user),
) -> None:
    preparation = _get_preparation(session, preparation_id)
    if preparation.status != "DRAFT":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Planlanmış bütçe çalışması silinemez.",
        )
    try:
        items = session.exec(
            select(BudgetPreparationItem).where(
                BudgetPreparationItem.preparation_id == preparation_id
            )
        ).all()
        for item in items:
            allocations = session.exec(
                select(BudgetPreparationAllocation).where(
                    BudgetPreparationAllocation.item_id == item.id
                )
            ).all()
            for allocation in allocations:
                session.delete(allocation)
            session.delete(item)
        session.delete(preparation)
        session.commit()
    except Exception:
        session.rollback()
        raise


def _apply_item_payload(
    item: BudgetPreparationItem, payload: BudgetPreparationItemInput
) -> None:
    item.budget_name = payload.budget_name
    if payload.budget_code:
        item.budget_code = payload.budget_code
    item.total_amount = payload.total_amount
    item.currency = payload.currency
    item.capex_opex = payload.capex_opex
    item.department = payload.department
    item.map_attribute = payload.map_attribute
    item.description = payload.description
    item.distribution_method = payload.distribution_method
    item.single_month = payload.single_month
    item.start_year = payload.start_year
    item.start_month = payload.start_month
    item.month_count = payload.month_count
    item.source_year = payload.source_year
    item.source_plan_id = payload.source_plan_id
    item.source_budget_item_id = payload.source_budget_item_id
    item.is_carryover = payload.is_carryover
    item.updated_at = datetime.utcnow()


@router.post(
    "/{preparation_id}/items",
    response_model=BudgetPreparationItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_item(
    preparation_id: int,
    payload: BudgetPreparationItemInput,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_write_user),
) -> BudgetPreparationItemRead:
    preparation = _get_preparation(session, preparation_id)
    _ensure_draft(preparation)
    payload = _canonicalize_item_metadata(session, payload)
    existing_codes = set(session.exec(
        select(BudgetPreparationItem.budget_code).where(
            BudgetPreparationItem.preparation_id == preparation_id
        )
    ).all())
    sequence = len(existing_codes) + 1
    generated_code = f"PREP-{preparation.year}-{preparation_id:04d}-{sequence:04d}"
    while generated_code in existing_codes:
        sequence += 1
        generated_code = f"PREP-{preparation.year}-{preparation_id:04d}-{sequence:04d}"
    item = BudgetPreparationItem(
        preparation_id=preparation_id,
        budget_code=payload.budget_code or generated_code,
    )
    _apply_item_payload(item, payload)
    session.add(item)
    try:
        session.flush()
        replace_allocations(session, item, payload)
        preparation.updated_at = datetime.utcnow()
        session.add(preparation)
        session.commit()
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Bu taslakta aynı bütçe koduna sahip başka bir kalem var.",
        ) from exc
    session.refresh(item)
    return build_item_read(session, item)


@router.put("/{preparation_id}/items/{item_id}", response_model=BudgetPreparationItemRead)
def update_item(
    preparation_id: int,
    item_id: int,
    payload: BudgetPreparationItemInput,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_write_user),
) -> BudgetPreparationItemRead:
    preparation = _get_preparation(session, preparation_id)
    _ensure_draft(preparation)
    payload = _canonicalize_item_metadata(session, payload)
    item = _get_item(session, preparation_id, item_id)
    _apply_item_payload(item, payload)
    session.add(item)
    try:
        replace_allocations(session, item, payload)
        preparation.updated_at = datetime.utcnow()
        session.add(preparation)
        session.commit()
    except ValueError as exc:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Bu taslakta aynı bütçe koduna sahip başka bir kalem var.",
        ) from exc
    session.refresh(item)
    return build_item_read(session, item)


@router.delete(
    "/{preparation_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_item(
    preparation_id: int,
    item_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_write_user),
) -> None:
    preparation = _get_preparation(session, preparation_id)
    _ensure_draft(preparation)
    item = _get_item(session, preparation_id, item_id)
    allocations = session.exec(
        select(BudgetPreparationAllocation).where(
            BudgetPreparationAllocation.item_id == item.id
        )
    ).all()
    for allocation in allocations:
        session.delete(allocation)
    session.delete(item)
    preparation.updated_at = datetime.utcnow()
    session.add(preparation)
    session.commit()


@router.post("/{preparation_id}/complete", response_model=BudgetPreparationCompleteRead)
def complete_preparation(
    preparation_id: int,
    confirm_carryover_overlap: bool = False,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_write_user),
) -> BudgetPreparationCompleteRead:
    preparation_model = _get_preparation(session, preparation_id)
    if preparation_model.status == "DRAFT" and not confirm_carryover_overlap:
        carryovers = discover_carryovers(session, preparation_model.year)
        items = session.exec(
            select(BudgetPreparationItem).where(
                BudgetPreparationItem.preparation_id == preparation_id
            )
        ).all()
        overlaps = [
            (item, match)
            for item in items
            for match in matching_carryovers(item, carryovers)
        ]
        if overlaps:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Devreden bütçeyle eşleşen yeni bütçe kalemleri var.",
                    "requires_confirmation": True,
                    "warnings": [
                        {
                            "item_id": item.id,
                            "budget_name": item.budget_name,
                            "source_year": match.source_year,
                            "carryover_amount": float(match.total_amount),
                            "new_amount": float(item.total_amount),
                            "total_effect": float(money(match.total_amount + item.total_amount)),
                        }
                        for item, match in overlaps
                    ],
                },
            )
    try:
        preparation, scenario_id, created_plan_entries = activate_preparation(
            session, preparation_id
        )
    except LookupError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        session.rollback()
        errors = [error.dict() for error in getattr(exc, "validation_errors", [])]
        raise HTTPException(
            status_code=422,
            detail={"message": "Bütçe tamamlanamadı", "errors": errors},
        ) from exc
    except Exception:
        session.rollback()
        raise
    return BudgetPreparationCompleteRead(
        preparation=build_preparation_read(session, preparation),
        scenario_id=scenario_id,
        created_plan_entries=created_plan_entries,
    )
