from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, PlanEntry, PurchaseFormStatusExt, User
from app.schemas import PurchaseAlertSetRequest

router = APIRouter(prefix="/purchase-alert", tags=["Purchase Alerts"])


@router.patch("/{item_id}")
def set_purchase_alert_requested(
    item_id: int,
    payload: PurchaseAlertSetRequest,
    session: Session = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    plan_row = session.exec(
        select(PlanEntry, BudgetItem.code)
        .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
        .where(PlanEntry.id == item_id)
    ).first()

    if not plan_row:
        raise HTTPException(status_code=404, detail="Kalem bulunamadı.")

    plan_entry, fallback_code = plan_row
    normalized_department = (plan_entry.department or "").strip()
    budget_code = (plan_entry.budget_code or "").strip() or fallback_code

    status = session.exec(
        select(PurchaseFormStatusExt)
        .where(PurchaseFormStatusExt.budget_code == budget_code)
        .where(PurchaseFormStatusExt.year == plan_entry.year)
        .where(PurchaseFormStatusExt.month == plan_entry.month)
        .where(PurchaseFormStatusExt.scenario_id == plan_entry.scenario_id)
        .where(PurchaseFormStatusExt.department == normalized_department)
    ).first()

    if not status:
        status = PurchaseFormStatusExt(
            budget_code=budget_code,
            year=plan_entry.year,
            month=plan_entry.month,
            scenario_id=plan_entry.scenario_id,
            department=normalized_department,
        )
        session.add(status)

    status.is_form_prepared = payload.requested
    if payload.requested:
        status.updated_at = datetime.utcnow()
        status.updated_by = user.id
    else:
        status.updated_at = None
        status.updated_by = None

    session.commit()

    return {
        "detail": "Satın alma talep durumu güncellendi.",
        "item_id": item_id,
        "requested": status.is_form_prepared,
        "requested_at": status.updated_at,
    }
