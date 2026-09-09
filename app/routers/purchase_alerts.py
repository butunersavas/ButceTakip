from datetime import date, datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session, is_viewer_user
from app.models import BudgetItem, PlanEntry, PurchaseFormStatusExt, User
from app.routers.plans import (
    _build_plan_read,
    _collect_plan_scope_totals,
    _normalize_capex_opex,
    _plan_read_query,
)
from app.schemas import PurchaseAlertSetRequest, PurchasePendingItem

router = APIRouter(prefix="/plan-items", tags=["Purchase Alerts"])
logger = logging.getLogger(__name__)


def _purchase_status_for(requested: bool) -> str:
    return "request_created" if requested else "pending"


def _normalize_purchase_status(value: str) -> str:
    normalized = value.strip().lower()
    aliases = {
        "": "all",
        "all": "all",
        "pending": "pending",
        "request_created": "request_created",
        "request-created": "request_created",
        "created": "request_created",
    }
    if normalized not in aliases:
        raise HTTPException(status_code=400, detail="Geçersiz satın alma durum filtresi.")
    return aliases[normalized]


def _plan_purchase_key(session: Session, plan_entry: PlanEntry) -> tuple[str | None, str]:
    budget_item = session.get(BudgetItem, plan_entry.budget_item_id)
    budget_code = (plan_entry.budget_code or "").strip() or (budget_item.code if budget_item else None)
    department = (plan_entry.department or "").strip()
    return budget_code, department


def _sync_purchase_form_status(
    *,
    session: Session,
    plan_entry: PlanEntry,
    requested: bool,
    user: User,
    now: datetime,
) -> None:
    budget_code, department = _plan_purchase_key(session, plan_entry)
    if not budget_code:
        return

    status_row = session.exec(
        select(PurchaseFormStatusExt)
        .where(PurchaseFormStatusExt.budget_code == budget_code)
        .where(PurchaseFormStatusExt.year == plan_entry.year)
        .where(PurchaseFormStatusExt.month == plan_entry.month)
        .where(PurchaseFormStatusExt.scenario_id == plan_entry.scenario_id)
        .where(PurchaseFormStatusExt.department == department)
    ).first()

    if status_row is None:
        if not requested:
            return
        status_row = PurchaseFormStatusExt(
            budget_code=budget_code,
            year=plan_entry.year,
            month=plan_entry.month,
            scenario_id=plan_entry.scenario_id,
            department=department,
            is_form_prepared=True,
            updated_at=now,
            updated_by=user.id,
        )
        session.add(status_row)
        return

    if status_row.is_form_prepared == requested:
        return

    status_row.is_form_prepared = requested
    status_row.updated_at = now
    status_row.updated_by = user.id
    session.add(status_row)


@router.get("/purchase-pending", response_model=list[PurchasePendingItem])
@router.get("/purchase-pending/", response_model=list[PurchasePendingItem], include_in_schema=False)
def list_purchase_pending_items(
    year: int | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    scenario_id: int | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    status: str = Query(default="all"),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[PurchasePendingItem]:
    today = date.today()
    selected_year = year or today.year
    selected_month = month or today.month
    normalized_status = _normalize_purchase_status(status)
    capex_filter = _normalize_capex_opex(capex_opex)

    query = (
        _plan_read_query(capex_filter)
        .where(PlanEntry.year == selected_year)
        .where(PlanEntry.month == selected_month)
        .where(PlanEntry.amount > 0)
    )
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    if department is not None:
        query = query.where(PlanEntry.department == department)

    rows = session.exec(
        query.order_by(PlanEntry.year, PlanEntry.month, PlanEntry.department, BudgetItem.name)
    ).all()
    scope_totals_by_key = _collect_plan_scope_totals(session, rows)

    items: list[PurchasePendingItem] = []
    for row in rows:
        plan = _build_plan_read(row._mapping, session, scope_totals_by_key)
        if float(plan.scope_available_amount or 0) <= 0.005:
            continue
        requested = bool(plan.purchase_requested or plan.is_form_prepared)
        purchase_status = _purchase_status_for(requested)
        if normalized_status != "all" and purchase_status != normalized_status:
            continue

        items.append(
            PurchasePendingItem(
                id=plan.id,
                budget_item_id=plan.budget_item_id,
                scenario_id=plan.scenario_id,
                year=plan.year,
                month=plan.month,
                department=plan.department,
                budget_code=plan.budget_code,
                budget_name=plan.budget_name,
                title=plan.budget_name or plan.budget_code or f"Plan #{plan.id}",
                capex_opex=plan.capex_opex,
                nitelik=plan.nitelik or plan.asset_type or plan.map_nitelik,
                planned_amount=float(plan.scope_revised_amount or plan.revised_amount or plan.amount or 0),
                actual_amount=float(plan.scope_actual_amount or plan.actual_amount or 0),
                remaining_amount=max(float(plan.scope_available_amount or plan.available_amount or 0), 0),
                requested=requested,
                status=purchase_status,
                requested_at=plan.purchase_requested_at,
                requested_by=plan.purchase_requested_by,
            )
        )

    return items


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
    if is_viewer_user(user):
        raise HTTPException(status_code=403, detail="Bu kullanıcı yalnızca görüntüleme yetkisine sahiptir.")
    if not payload.requested and float(plan_entry.unused_amount or 0) > 0:
        raise HTTPException(
            status_code=409,
            detail="Kullanılmayacak bütçe kaleminin talep durumu geri alınamaz.",
        )

    budget_code, department = _plan_purchase_key(session, plan_entry)
    prepared_status = None
    if budget_code:
        prepared_status = session.exec(
            select(PurchaseFormStatusExt)
            .where(PurchaseFormStatusExt.budget_code == budget_code)
            .where(PurchaseFormStatusExt.year == plan_entry.year)
            .where(PurchaseFormStatusExt.month == plan_entry.month)
            .where(PurchaseFormStatusExt.scenario_id == plan_entry.scenario_id)
            .where(PurchaseFormStatusExt.department == department)
        ).first()
    currently_requested = bool(
        plan_entry.purchase_requested or (prepared_status and prepared_status.is_form_prepared)
    )
    if not payload.requested and not currently_requested:
        raise HTTPException(status_code=409, detail="Bütçe kalemi zaten Satın Alma Bekleyen durumunda.")

    now = datetime.utcnow()
    requested_changed = bool(plan_entry.purchase_requested) != payload.requested
    if requested_changed:
        plan_entry.purchase_requested = payload.requested
        plan_entry.updated_at = now
        if payload.requested:
            plan_entry.purchase_requested_at = now
            plan_entry.purchase_requested_by = user.username
        else:
            plan_entry.purchase_requested_at = None
            plan_entry.purchase_requested_by = None

    _sync_purchase_form_status(
        session=session,
        plan_entry=plan_entry,
        requested=payload.requested,
        user=user,
        now=now,
    )
    session.add(plan_entry)
    session.commit()
    session.refresh(plan_entry)

    if not payload.requested:
        logger.info(
            "Talep oluşturuldu işareti geri alındı",
            extra={
                "plan_id": item_id,
                "user_id": user.id,
                "previous_status": "request_created",
                "new_status": "pending",
            },
        )

    requested = bool(plan_entry.purchase_requested)
    return {
        "detail": "Satın alma takip durumu güncellendi.",
        "item_id": item_id,
        "requested": requested,
        "status": _purchase_status_for(requested),
        "requested_at": plan_entry.purchase_requested_at,
        "requested_by": plan_entry.purchase_requested_by,
    }
