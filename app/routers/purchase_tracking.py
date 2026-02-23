from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, PlanEntry, PurchaseRequestTracking, PurchaseTrackingStatus, User
from app.schemas import PurchaseTrackingRead, PurchaseTrackingUpdateRequest

router = APIRouter(prefix="/purchase-tracking", tags=["Purchase Tracking"])


@router.get("", response_model=list[PurchaseTrackingRead])
def list_purchase_tracking(
    year: int = Query(...),
    month: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    department: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _=Depends(get_current_user),
) -> list[PurchaseTrackingRead]:
    query = select(PlanEntry, BudgetItem, PurchaseRequestTracking).join(
        BudgetItem, PlanEntry.budget_item_id == BudgetItem.id
    ).outerjoin(
        PurchaseRequestTracking, PurchaseRequestTracking.plan_item_id == PlanEntry.id
    ).where(PlanEntry.year == year)

    if month is not None:
        query = query.where(PlanEntry.month == month)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    if department:
        query = query.where(PlanEntry.department == department)

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
    )
