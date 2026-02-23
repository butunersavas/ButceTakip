from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import PlanEntry, PurchaseRequestTracking, PurchaseTrackingStatus, User
from app.schemas import PurchaseAlertSetRequest

router = APIRouter(prefix="/plan-items", tags=["Purchase Alerts"])


@router.patch("/{item_id}/purchase-requested")
@router.patch("/{item_id}/purchase-requested/")
def set_purchase_alert_requested(
    item_id: int,
    payload: PurchaseAlertSetRequest,
    session: Session = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    plan_entry = session.get(PlanEntry, item_id)
    if not plan_entry:
        raise HTTPException(status_code=404, detail="Kalem bulunamadı.")

    plan_entry.purchase_requested = payload.requested
    if payload.requested:
        plan_entry.purchase_requested_at = datetime.utcnow()
        plan_entry.purchase_requested_by = user.username
        tracking = session.exec(
            select(PurchaseRequestTracking).where(PurchaseRequestTracking.plan_item_id == item_id)
        ).first()
        if not tracking:
            tracking = PurchaseRequestTracking(
                plan_item_id=item_id,
                status=PurchaseTrackingStatus.TALEP_OLUSTURULDU.value,
                updated_at=datetime.utcnow(),
                updated_by=user.username,
                is_active=True,
            )
        else:
            tracking.status = PurchaseTrackingStatus.TALEP_OLUSTURULDU.value
            tracking.updated_at = datetime.utcnow()
            tracking.updated_by = user.username
            tracking.is_active = True
        session.add(tracking)
    else:
        plan_entry.purchase_requested_at = None
        plan_entry.purchase_requested_by = None
        tracking = session.exec(
            select(PurchaseRequestTracking).where(PurchaseRequestTracking.plan_item_id == item_id)
        ).first()
        if tracking:
            tracking.status = PurchaseTrackingStatus.CANCELLED.value
            tracking.updated_at = datetime.utcnow()
            tracking.updated_by = user.username
            tracking.is_active = False
            session.add(tracking)

    session.add(plan_entry)
    session.commit()
    session.refresh(plan_entry)

    return {
        "detail": "Satın alma talep durumu güncellendi.",
        "item_id": item_id,
        "requested": plan_entry.purchase_requested,
        "requested_at": plan_entry.purchase_requested_at,
    }
