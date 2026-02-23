from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, PlanEntry, PurchaseRequestTracking, PurchaseTrackingStatus, User
from app.schemas import PurchaseTrackingRead, PurchaseTrackingUpdateRequest

router = APIRouter(prefix="/purchase-tracking", tags=["Purchase Tracking"])

MONTH_MAP_TR = {
    "ocak": 1,
    "şubat": 2,
    "subat": 2,
    "mart": 3,
    "nisan": 4,
    "mayıs": 5,
    "mayis": 5,
    "haziran": 6,
    "temmuz": 7,
    "ağustos": 8,
    "agustos": 8,
    "eylül": 9,
    "eylul": 9,
    "ekim": 10,
    "kasım": 11,
    "kasim": 11,
    "aralık": 12,
    "aralik": 12,
}


def normalize_month(value: str | int | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        if 1 <= value <= 12:
            return value
        raise HTTPException(status_code=422, detail="Ay 1-12 arasında olmalıdır")

    raw = value.strip()
    if not raw:
        return None

    if raw.isdigit():
        numeric = int(raw)
        if 1 <= numeric <= 12:
            return numeric
        raise HTTPException(status_code=422, detail="Ay 1-12 arasında olmalıdır")

    month = MONTH_MAP_TR.get(raw.lower())
    if month is None:
        raise HTTPException(status_code=422, detail="Geçersiz ay değeri")
    return month


@router.get("", response_model=list[PurchaseTrackingRead])
def list_purchase_tracking(
    year: int = Query(...),
    month: str | int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    department: str | None = Query(default=None),
    budget_item: int | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _=Depends(get_current_user),
) -> list[PurchaseTrackingRead]:
    query = select(PlanEntry, BudgetItem, PurchaseRequestTracking).join(
        BudgetItem, PlanEntry.budget_item_id == BudgetItem.id
    ).outerjoin(
        PurchaseRequestTracking, PurchaseRequestTracking.plan_item_id == PlanEntry.id
    ).where(PlanEntry.year == year, PlanEntry.purchase_requested.is_(True))

    normalized_month = normalize_month(month)

    if normalized_month is not None:
        query = query.where(PlanEntry.month == normalized_month)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    if department:
        query = query.where(PlanEntry.department == department)
    if budget_item is not None:
        query = query.where(PlanEntry.budget_item_id == budget_item)
    if capex_opex:
        query = query.where(func.lower(func.coalesce(BudgetItem.map_category, "")) == capex_opex.lower())

    rows = session.exec(query.order_by(PlanEntry.month, BudgetItem.code)).all()
    result: list[PurchaseTrackingRead] = []
    for plan, budget_item, tracking in rows:
        status = (
            tracking.status
            if tracking
            else (
                PurchaseTrackingStatus.TALEP_OLUSTURULDU.value
                if plan.purchase_requested
                else "BEKLEMEDE"
            )
        )
        result.append(
            PurchaseTrackingRead(
                id=tracking.id if tracking else None,
                plan_item_id=plan.id,
                status=status,
                updated_at=tracking.updated_at if tracking else None,
                updated_by=tracking.updated_by if tracking else None,
                note=tracking.note if tracking else None,
                is_active=tracking.is_active if tracking else bool(plan.purchase_requested),
                year=plan.year,
                month=plan.month,
                department=plan.department,
                scenario_id=plan.scenario_id,
                budget_item_id=plan.budget_item_id,
                budget_code=budget_item.code if budget_item else plan.budget_code,
                budget_name=budget_item.name if budget_item else plan.budget_code,
                amount=plan.amount,
                purchase_requested=plan.purchase_requested,
                purchase_requested_at=plan.purchase_requested_at,
            )
        )
    return result


@router.patch("/{plan_item_id}", response_model=PurchaseTrackingRead)
def update_purchase_tracking(
    plan_item_id: int,
    payload: PurchaseTrackingUpdateRequest,
    session: Session = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> PurchaseTrackingRead:
    plan = session.get(PlanEntry, plan_item_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan kalemi bulunamadı")

    budget_item = session.get(BudgetItem, plan.budget_item_id)
    tracking = session.exec(
        select(PurchaseRequestTracking).where(PurchaseRequestTracking.plan_item_id == plan_item_id)
    ).first()

    if not tracking:
        tracking = PurchaseRequestTracking(plan_item_id=plan_item_id)

    tracking.status = payload.status
    tracking.note = payload.note
    tracking.updated_by = user.username
    tracking.updated_at = datetime.utcnow()
    tracking.is_active = payload.status != PurchaseTrackingStatus.CANCELLED.value

    session.add(tracking)
    session.commit()
    session.refresh(tracking)

    return PurchaseTrackingRead(
        id=tracking.id,
        plan_item_id=plan.id,
        status=tracking.status,
        updated_at=tracking.updated_at,
        updated_by=tracking.updated_by,
        note=tracking.note,
        is_active=tracking.is_active,
        year=plan.year,
        month=plan.month,
        department=plan.department,
        scenario_id=plan.scenario_id,
        budget_item_id=plan.budget_item_id,
        budget_code=budget_item.code if budget_item else plan.budget_code,
        budget_name=budget_item.name if budget_item else plan.budget_code,
        amount=plan.amount,
        purchase_requested=plan.purchase_requested,
        purchase_requested_at=plan.purchase_requested_at,
    )
