from datetime import date, datetime
import ipaddress
import logging
import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session, is_viewer_user
from app.models import (
    BudgetItem,
    BudgetTransfer,
    Expense,
    ExpenseAllocation,
    ExpenseAttachment,
    ExpenseStatus,
    PlanEntry,
    PurchaseFormStatusExt,
    Scenario,
    User,
)
from app.schemas import (
    DeleteDependencyInfo,
    ExpenseAllocationRead,
    ExpenseAttachmentRead,
    ExpenseCreate,
    ExpenseRead,
    ExpenseUnusedBudgetCreate,
    ExpenseUpdate,
    PlanEntryRead,
)
from app.routers.plans import _fetch_plan_read
from app.services.analytics import (
    BudgetScopeAggregate,
    BudgetScopeKey,
    compute_budget_scope_statuses,
)
from app.services.related_records import count_related_file_records, delete_related_file_records

router = APIRouter(prefix="/expenses", tags=["Expenses"])
logger = logging.getLogger(__name__)


def _ensure_expense_write_allowed(current_user: User) -> None:
    if is_viewer_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu kullanici yalnizca goruntuleme yetkisine sahiptir.",
        )


def _extract_client_identifier(request: Request) -> str | None:
    header_candidates = [
        "x-forwarded-for",
        "x-real-ip",
        "x-client-ip",
        "cf-connecting-ip",
        "true-client-ip",
    ]

    for header_name in header_candidates:
        header_value = request.headers.get(header_name)
        if not header_value:
            continue

        first_value = header_value.split(",")[0].strip()
        if not first_value or first_value.lower() == "localhost":
            continue

        try:
            ip_value = ipaddress.ip_address(first_value)
        except ValueError:
            return first_value

        if not (ip_value.is_loopback or ip_value.is_unspecified):
            return first_value

    return None


def _normalize_capex_opex(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized in {"capex", "opex"}:
        return normalized
    return None


def _parse_month_list(value: str | None) -> list[int] | None:
    if value is None:
        return None
    months: list[int] = []
    for raw in str(value).split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            month = int(raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Geçersiz ay filtresi.") from exc
        if month < 1 or month > 12:
            raise HTTPException(status_code=400, detail="Ay değeri 1 ile 12 arasında olmalı.")
        if month not in months:
            months.append(month)
    return sorted(months) if months else None


def _expense_plan_scope(expense: Expense) -> tuple[int, int, int, int] | None:
    if (
        expense.is_out_of_budget
        or not expense.budget_item_id
        or not expense.scenario_id
        or not expense.expense_date
    ):
        return None
    return (
        expense.budget_item_id,
        expense.expense_date.year,
        expense.expense_date.month,
        expense.scenario_id,
    )


def _expense_allocation_scopes(session: Session, expense_id: int | None) -> set[tuple[int, int, int, int]]:
    if not expense_id:
        return set()
    rows = session.exec(
        select(
            ExpenseAllocation.budget_item_id,
            ExpenseAllocation.year,
            ExpenseAllocation.month,
            ExpenseAllocation.scenario_id,
        ).where(ExpenseAllocation.expense_id == expense_id)
    ).all()
    return {
        (
            int(row.budget_item_id),
            int(row.year),
            int(row.month),
            int(row.scenario_id),
        )
        for row in rows
        if row.scenario_id is not None
    }


def _expense_plan_scopes(session: Session, expense: Expense) -> set[tuple[int, int, int, int]]:
    scopes = _expense_allocation_scopes(session, expense.id)
    if scopes:
        return scopes
    fallback_scope = _expense_plan_scope(expense)
    return {fallback_scope} if fallback_scope else set()


def _allocation_data_scopes(
    allocation_data: list[dict[str, int | float]],
) -> set[tuple[int, int, int, int]]:
    return {
        (
            int(item["budget_item_id"]),
            int(item["year"]),
            int(item["month"]),
            int(item["scenario_id"]),
        )
        for item in allocation_data
        if item.get("scenario_id") is not None
    }


def _has_active_expense_for_scope(
    session: Session,
    scope: tuple[int, int, int, int],
) -> bool:
    budget_item_id, year, month, scenario_id = scope
    start_date = date(year, month, 1)
    end_date = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    allocated_expense = session.exec(
        select(ExpenseAllocation.id)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(ExpenseAllocation.budget_item_id == budget_item_id)
        .where(ExpenseAllocation.scenario_id == scenario_id)
        .where(ExpenseAllocation.year == year)
        .where(ExpenseAllocation.month == month)
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
    ).first()
    if allocated_expense is not None:
        return True
    active_expense = session.exec(
        select(Expense.id)
        .where(Expense.budget_item_id == budget_item_id)
        .where(Expense.scenario_id == scenario_id)
        .where(Expense.expense_date >= start_date)
        .where(Expense.expense_date < end_date)
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
    ).first()
    return active_expense is not None


def _set_plan_purchase_status(
    session: Session,
    scope: tuple[int, int, int, int],
    is_form_prepared: bool,
    user_id: int | None,
) -> None:
    budget_item_id, year, month, scenario_id = scope
    budget_item = session.get(BudgetItem, budget_item_id)
    plans = session.exec(
        select(PlanEntry)
        .where(PlanEntry.budget_item_id == budget_item_id)
        .where(PlanEntry.year == year)
        .where(PlanEntry.month == month)
        .where(PlanEntry.scenario_id == scenario_id)
    ).all()

    for plan in plans:
        plan.purchase_requested = is_form_prepared
        plan.purchase_requested_at = datetime.utcnow() if is_form_prepared else None
        plan.purchase_requested_by = str(user_id) if is_form_prepared and user_id else None
        plan.updated_at = datetime.utcnow()
        session.add(plan)
        budget_code = plan.budget_code or (budget_item.code if budget_item else None)
        if not budget_code:
            continue
        department = plan.department or ""
        status_row = session.exec(
            select(PurchaseFormStatusExt)
            .where(PurchaseFormStatusExt.budget_code == budget_code)
            .where(PurchaseFormStatusExt.year == year)
            .where(PurchaseFormStatusExt.month == month)
            .where(PurchaseFormStatusExt.scenario_id == scenario_id)
            .where(PurchaseFormStatusExt.department == department)
        ).first()
        if not status_row:
            status_row = PurchaseFormStatusExt(
                budget_code=budget_code,
                year=year,
                month=month,
                scenario_id=scenario_id,
                department=department,
            )
        status_row.is_form_prepared = is_form_prepared
        status_row.updated_at = datetime.utcnow()
        status_row.updated_by = user_id
        session.add(status_row)


def _sync_plan_purchase_status(
    session: Session,
    scope: tuple[int, int, int, int] | None,
    user_id: int | None,
) -> None:
    if not scope:
        return
    _set_plan_purchase_status(
        session,
        scope,
        _has_active_expense_for_scope(session, scope),
        user_id,
    )


ALLOCATION_INPUT_FIELDS = {
    "allocation_mode",
    "allocation_start_month",
    "allocation_month_count",
    "allocation_method",
}


def _delete_expense_allocations(session: Session, expense_id: int) -> None:
    allocations = session.exec(
        select(ExpenseAllocation).where(ExpenseAllocation.expense_id == expense_id)
    ).all()
    for allocation in allocations:
        session.delete(allocation)


def _split_cents_evenly(total_cents: int, count: int) -> list[int]:
    base = total_cents // count
    return [base] * (count - 1) + [total_cents - (base * (count - 1))]


def _build_scope_summary(
    scope: BudgetScopeAggregate | None,
    fallback_plan: float = 0.0,
) -> dict[str, float]:
    scope_plan = float(scope.revised_plan if scope else fallback_plan or 0.0)
    scope_actual = float(scope.actual if scope else 0.0)
    scope_unused = float(scope.unused_amount if scope else 0.0)
    scope_remaining = max(scope_plan - scope_actual - scope_unused, 0.0)
    scope_overrun = max(scope_actual - scope_plan, 0.0)
    scope_saving = (
        scope_remaining
        if scope_plan > 0.005
        and scope_actual > 0.005
        and scope_unused <= 0.005
        and scope_remaining > 0.005
        else 0.0
    )
    return {
        "plan": round(scope_plan, 2),
        "actual": round(scope_actual, 2),
        "unused": round(scope_unused, 2),
        "remaining": round(scope_remaining, 2),
        "saving": round(scope_saving, 2),
        "overrun": round(scope_overrun, 2),
    }


def _build_allocation_data(
    session: Session,
    expense: Expense,
    allocation_mode: str | None,
    start_month: int | None,
    month_count: int | None,
    allocation_method: str | None,
) -> list[dict[str, int | float]]:
    if expense.is_out_of_budget:
        return []
    if (allocation_mode or "single") != "planned_months":
        return []
    if not expense.budget_item_id:
        raise HTTPException(status_code=400, detail="Butce kalemi secmelisiniz.")
    if not start_month:
        raise HTTPException(status_code=400, detail="Başlangıç ayı boş olamaz.")
    if not month_count or month_count < 1:
        raise HTTPException(status_code=400, detail="Dağıtılacak ay sayısı 1'den küçük olamaz.")
    end_month = start_month + month_count - 1
    if start_month < 1 or start_month > 12 or end_month > 12:
        raise HTTPException(status_code=400, detail="Dağıtım Aralık ayını geçemez.")
    method = allocation_method or "equal"
    if method not in {"equal", "plan_amount"}:
        raise HTTPException(status_code=400, detail="Dağıtım yöntemi boş olamaz.")
    if not expense.scenario_id:
        raise HTTPException(status_code=400, detail="Senaryo seçmelisiniz.")
    if not expense.amount or expense.amount <= 0:
        raise HTTPException(status_code=400, detail="Dağıtım için tutar 0'dan büyük olmalı.")

    months = list(range(start_month, end_month + 1))
    total_cents = int(round(float(expense.amount) * 100))
    if method == "equal":
        amount_cents = _split_cents_evenly(total_cents, month_count)
    else:
        plan_rows = session.exec(
            select(PlanEntry.month, func.sum(PlanEntry.amount).label("plan_amount"))
            .where(PlanEntry.budget_item_id == expense.budget_item_id)
            .where(PlanEntry.scenario_id == expense.scenario_id)
            .where(PlanEntry.year == expense.expense_date.year)
            .where(PlanEntry.month.in_(months))
            .group_by(PlanEntry.month)
        ).all()
        plan_by_month = {int(row.month): float(row.plan_amount or 0) for row in plan_rows}
        transfer_rows = session.exec(
            select(BudgetTransfer)
            .where(BudgetTransfer.is_cancelled.is_(False))
            .where(
                or_(
                    and_(
                        BudgetTransfer.source_budget_item_id == expense.budget_item_id,
                        BudgetTransfer.source_scenario_id == expense.scenario_id,
                        BudgetTransfer.source_year == expense.expense_date.year,
                        BudgetTransfer.source_month.in_(months),
                    ),
                    and_(
                        BudgetTransfer.target_budget_item_id == expense.budget_item_id,
                        BudgetTransfer.target_scenario_id == expense.scenario_id,
                        BudgetTransfer.target_year == expense.expense_date.year,
                        BudgetTransfer.target_month.in_(months),
                    ),
                )
            )
        ).all()
        for transfer in transfer_rows:
            if (
                transfer.source_budget_item_id == expense.budget_item_id
                and transfer.source_scenario_id == expense.scenario_id
                and transfer.source_year == expense.expense_date.year
                and transfer.source_month in months
            ):
                plan_by_month[transfer.source_month] = plan_by_month.get(
                    transfer.source_month, 0.0
                ) - float(transfer.amount or 0)
            if (
                transfer.target_budget_item_id == expense.budget_item_id
                and transfer.target_scenario_id == expense.scenario_id
                and transfer.target_year == expense.expense_date.year
                and transfer.target_month in months
            ):
                plan_by_month[transfer.target_month] = plan_by_month.get(
                    transfer.target_month, 0.0
                ) + float(transfer.amount or 0)
        missing_months = [month for month in months if plan_by_month.get(month, 0) <= 0]
        if missing_months:
            raise HTTPException(
                status_code=400,
                detail="Plan tutarlarına göre dağıtım için seçilen tüm aylarda plan tutarı bulunmalı.",
            )
        total_plan = sum(plan_by_month[month] for month in months)
        if total_plan <= 0:
            raise HTTPException(status_code=400, detail="Seçilen ay aralığında plan tutarı bulunamadı.")
        amount_cents = []
        used_cents = 0
        for month in months[:-1]:
            cents = int(total_cents * (plan_by_month[month] / total_plan))
            amount_cents.append(cents)
            used_cents += cents
        amount_cents.append(total_cents - used_cents)

    return [
        {
            "budget_item_id": expense.budget_item_id,
            "scenario_id": expense.scenario_id,
            "year": expense.expense_date.year,
            "month": month,
            "allocated_amount": cents / 100,
        }
        for month, cents in zip(months, amount_cents)
    ]


def _create_expense_allocations(
    session: Session,
    expense: Expense,
    allocation_data: list[dict[str, int | float]],
) -> None:
    for item in allocation_data:
        session.add(ExpenseAllocation(expense_id=expense.id, **item))


def _build_expense_read(
    row: dict,
    department_map: dict[tuple[int, int | None], str] | None = None,
    plan_amount_map: dict[tuple[int, int, int, int | None], float] | None = None,
    budget_scope_map: dict[BudgetScopeKey, BudgetScopeAggregate] | None = None,
    attachment_count_map: dict[int, int] | None = None,
    allocation_map: dict[int, list[ExpenseAllocationRead]] | None = None,
) -> ExpenseRead:
    created_name = (
        row.get("created_full_name")
        or row.get("created_username")
        or row.get("created_email")
    )
    updated_name = (
        row.get("updated_full_name")
        or row.get("updated_username")
        or row.get("updated_email")
    )
    is_out_of_budget = bool(row.get("is_out_of_budget"))
    outside_title = row.get("budget_outside_title")
    outside_department = row.get("budget_outside_department")
    outside_capex_opex = row.get("budget_outside_capex_opex")
    outside_asset_type = row.get("budget_outside_asset_type")
    raw_capex_opex = row.get("capex_opex") or outside_capex_opex
    capex_opex = str(raw_capex_opex).title() if raw_capex_opex else None
    department = None
    if department_map:
        key = (row.get("budget_item_id"), row.get("scenario_id"))
        department = department_map.get(key) or department_map.get(
            (row.get("budget_item_id"), None)
        )
    department = department or outside_department
    status = row.get("status")
    expense_date = row.get("expense_date")
    raw_allocations = (allocation_map or {}).get(row.get("id"), [])
    allocations = raw_allocations
    plan_amount = 0.0
    actual_amount = 0.0
    unused_amount = 0.0
    scope_plan_amount = 0.0
    scope_actual_amount = 0.0
    scope_unused_amount = 0.0
    scope_remaining_amount = 0.0
    scope_saving_amount = 0.0
    scope_overrun_amount = 0.0
    if expense_date:
        plan_key = (
            row.get("budget_item_id"),
            expense_date.year,
            expense_date.month,
            row.get("scenario_id"),
        )
        plan_amount = float((plan_amount_map or {}).get(plan_key, 0.0))
        amount = float(row.get("amount") or 0.0)
        if raw_allocations:
            allocation_reads: list[ExpenseAllocationRead] = []
            seen_scope_keys: set[BudgetScopeKey] = set()
            for allocation in raw_allocations:
                allocation_key = (
                    row.get("budget_item_id"),
                    allocation.year,
                    allocation.month,
                    row.get("scenario_id"),
                )
                scope = budget_scope_map.get(allocation_key) if budget_scope_map else None
                fallback_plan = float((plan_amount_map or {}).get(allocation_key, 0.0))
                scope_summary = _build_scope_summary(scope, fallback_plan)
                allocation_plan = scope_summary["plan"] if scope else fallback_plan
                allocated_amount = float(allocation.allocated_amount or 0.0)
                allocation_available = max(allocation_plan - allocated_amount, 0.0)
                allocation_reads.append(
                    ExpenseAllocationRead(
                        year=allocation.year,
                        month=allocation.month,
                        allocated_amount=allocated_amount,
                        plan_amount=round(allocation_plan, 2),
                        actual_amount=round(allocated_amount, 2),
                        unused_amount=0.0,
                        available_amount=round(allocation_available, 2),
                        saving_amount=0.0,
                        scope_plan_amount=scope_summary["plan"],
                        scope_actual_amount=scope_summary["actual"],
                        scope_unused_amount=scope_summary["unused"],
                        scope_remaining_amount=scope_summary["remaining"],
                        scope_saving_amount=scope_summary["saving"],
                        scope_overrun_amount=scope_summary["overrun"],
                    )
                )
                if allocation_key not in seen_scope_keys:
                    seen_scope_keys.add(allocation_key)
                    scope_plan_amount += scope_summary["plan"]
                    scope_actual_amount += scope_summary["actual"]
                    scope_unused_amount += scope_summary["unused"]
                    scope_remaining_amount += scope_summary["remaining"]
                    scope_saving_amount += scope_summary["saving"]
                    scope_overrun_amount += scope_summary["overrun"]
            allocations = allocation_reads
            plan_amount = sum(
                float(allocation.plan_amount or 0.0)
                for allocation in allocations
            )
            actual_amount = sum(
                float(allocation.actual_amount or 0.0)
                for allocation in allocations
            )
            unused_amount = 0.0
        elif budget_scope_map:
            scope = budget_scope_map.get(plan_key)
            scope_summary = _build_scope_summary(scope, plan_amount)
            if scope:
                plan_amount = scope_summary["plan"]
            scope_plan_amount = scope_summary["plan"]
            scope_actual_amount = scope_summary["actual"]
            scope_unused_amount = scope_summary["unused"]
            scope_remaining_amount = scope_summary["remaining"]
            scope_saving_amount = scope_summary["saving"]
            scope_overrun_amount = scope_summary["overrun"]
            actual_amount = amount
            unused_amount = 0.0
    amount = float(row.get("amount") or 0.0)
    if actual_amount == 0:
        actual_amount = amount
    available_amount = max(plan_amount - actual_amount, 0.0)
    saving_amount = 0.0
    attachment_count = int((attachment_count_map or {}).get(row.get("id"), 0))
    return ExpenseRead(
        id=row.get("id"),
        budget_item_id=row.get("budget_item_id"),
        scenario_id=row.get("scenario_id"),
        expense_date=expense_date,
        amount=amount,
        quantity=row.get("quantity"),
        unit_price=row.get("unit_price"),
        vendor=row.get("vendor"),
        description=row.get("description"),
        status=status,
        is_out_of_budget=is_out_of_budget,
        budget_outside_title=outside_title,
        budget_outside_department=outside_department,
        budget_outside_capex_opex=outside_capex_opex,
        budget_outside_asset_type=outside_asset_type,
        is_cancelled=status == ExpenseStatus.CANCELLED if status else None,
        plan_amount=plan_amount,
        actual_amount=round(actual_amount, 2),
        saving_amount=round(saving_amount, 2),
        unused_amount=round(unused_amount, 2),
        available_amount=round(available_amount, 2),
        scope_plan_amount=round(scope_plan_amount, 2),
        scope_actual_amount=round(scope_actual_amount, 2),
        scope_unused_amount=round(scope_unused_amount, 2),
        scope_remaining_amount=round(scope_remaining_amount, 2),
        scope_saving_amount=round(scope_saving_amount, 2),
        scope_overrun_amount=round(scope_overrun_amount, 2),
        attachment_count=attachment_count,
        has_attachment=attachment_count > 0,
        allocation_count=len(allocations),
        allocations=allocations,
        created_by_name=created_name,
        updated_by_name=updated_name,
        created_by_username=created_name,
        updated_by_username=updated_name,
        scenario_name=row.get("scenario_name"),
        budget_code=row.get("expense_budget_code") or row.get("budget_code"),
        budget_name=row.get("budget_name") or (outside_title if is_out_of_budget else None),
        capex_opex=capex_opex,
        department=department,
        asset_type=row.get("asset_type") or outside_asset_type,
        map_capex_opex=capex_opex,
        map_nitelik=row.get("asset_type") or outside_asset_type,
        nitelik=row.get("asset_type") or outside_asset_type,
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _build_department_map(
    session: Session,
    budget_ids: set[int],
    year: int | None,
    scenario_id: int | None,
) -> dict[tuple[int, int | None], str]:
    if not budget_ids:
        return {}
    query = (
        select(PlanEntry.budget_item_id, PlanEntry.scenario_id, PlanEntry.department)
        .where(PlanEntry.department.is_not(None))
        .where(PlanEntry.budget_item_id.in_(budget_ids))
    )
    if year is not None:
        query = query.where(PlanEntry.year == year)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    rows = session.exec(query).all()
    return {
        (row.budget_item_id, row.scenario_id): row.department
        for row in rows
        if row.department
    }


def _build_plan_amount_map(
    session: Session,
    rows: list[dict],
    allocation_map: dict[int, list[ExpenseAllocationRead]] | None = None,
) -> dict[tuple[int, int, int, int | None], float]:
    keys = {
        (
            row.get("budget_item_id"),
            row.get("expense_date").year,
            row.get("expense_date").month,
            row.get("scenario_id"),
        )
        for row in rows
        if row.get("budget_item_id") and row.get("expense_date")
    }
    if allocation_map:
        for row in rows:
            expense_id = row.get("id")
            budget_item_id = row.get("budget_item_id")
            if not expense_id or not budget_item_id:
                continue
            for allocation in allocation_map.get(expense_id, []):
                keys.add(
                    (
                        budget_item_id,
                        allocation.year,
                        allocation.month,
                        row.get("scenario_id"),
                    )
                )
    if not keys:
        return {}

    budget_ids = {key[0] for key in keys}
    years = {key[1] for key in keys}
    months = {key[2] for key in keys}
    scenario_ids = {key[3] for key in keys if key[3] is not None}

    query = (
        select(
            PlanEntry.budget_item_id,
            PlanEntry.year,
            PlanEntry.month,
            PlanEntry.scenario_id,
            func.sum(PlanEntry.amount).label("plan_amount"),
        )
        .where(PlanEntry.budget_item_id.in_(budget_ids))
        .where(PlanEntry.year.in_(years))
        .where(PlanEntry.month.in_(months))
        .group_by(
            PlanEntry.budget_item_id,
            PlanEntry.year,
            PlanEntry.month,
            PlanEntry.scenario_id,
        )
    )
    if scenario_ids:
        query = query.where(PlanEntry.scenario_id.in_(scenario_ids))

    plan_rows = session.exec(query).all()
    plan_map = {
        (row.budget_item_id, row.year, row.month, row.scenario_id): float(row.plan_amount or 0)
        for row in plan_rows
    }

    transfer_query = select(BudgetTransfer).where(BudgetTransfer.is_cancelled.is_(False))
    if scenario_ids:
        transfer_query = transfer_query.where(
            (BudgetTransfer.source_scenario_id.in_(scenario_ids))
            | (BudgetTransfer.target_scenario_id.in_(scenario_ids))
        )
    transfers = session.exec(transfer_query).all()
    for transfer in transfers:
        source_key = (
            transfer.source_budget_item_id,
            transfer.source_year,
            transfer.source_month,
            transfer.source_scenario_id,
        )
        if source_key in keys:
            plan_map[source_key] = plan_map.get(source_key, 0.0) - float(transfer.amount or 0)

        target_key = (
            transfer.target_budget_item_id,
            transfer.target_year,
            transfer.target_month,
            transfer.target_scenario_id,
        )
        if target_key in keys:
            plan_map[target_key] = plan_map.get(target_key, 0.0) + float(transfer.amount or 0)

    return plan_map


def _build_attachment_count_map(
    session: Session,
    expense_ids: set[int],
) -> dict[int, int]:
    if not expense_ids:
        return {}
    rows = session.exec(
        select(
            ExpenseAttachment.expense_id,
            func.count(ExpenseAttachment.id).label("attachment_count"),
        )
        .where(ExpenseAttachment.expense_id.in_(expense_ids))
        .group_by(ExpenseAttachment.expense_id)
    ).all()
    return {row.expense_id: int(row.attachment_count or 0) for row in rows}


def _build_allocation_map(
    session: Session,
    expense_ids: set[int],
) -> dict[int, list[ExpenseAllocationRead]]:
    if not expense_ids:
        return {}
    rows = session.exec(
        select(ExpenseAllocation)
        .where(ExpenseAllocation.expense_id.in_(expense_ids))
        .order_by(ExpenseAllocation.year, ExpenseAllocation.month)
    ).all()
    allocation_map: dict[int, list[ExpenseAllocationRead]] = {}
    for row in rows:
        allocation_map.setdefault(row.expense_id, []).append(
            ExpenseAllocationRead(
                year=row.year,
                month=row.month,
                allocated_amount=float(row.allocated_amount or 0),
            )
        )
    return allocation_map


def _build_expense_reads(
    session: Session,
    rows,
    year: int | None = None,
    scenario_id: int | None = None,
) -> list[ExpenseRead]:
    row_maps = [row._mapping if hasattr(row, "_mapping") else row for row in rows]
    budget_ids = {row.get("budget_item_id") for row in row_maps if row.get("budget_item_id")}
    expense_ids = {row.get("id") for row in row_maps if row.get("id")}
    department_map = _build_department_map(session, budget_ids, year, scenario_id)
    attachment_count_map = _build_attachment_count_map(session, expense_ids)
    allocation_map = _build_allocation_map(session, expense_ids)
    plan_amount_map = _build_plan_amount_map(session, row_maps, allocation_map)
    budget_scope_map: dict[BudgetScopeKey, BudgetScopeAggregate] = {}
    scope_months_by_year: dict[int, set[int]] = {}
    for row in row_maps:
        expense_date = row.get("expense_date")
        if expense_date:
            scope_months_by_year.setdefault(expense_date.year, set()).add(
                expense_date.month
            )
        for allocation in allocation_map.get(row.get("id"), []):
            scope_months_by_year.setdefault(allocation.year, set()).add(
                allocation.month
            )
    for scope_year, scope_months in scope_months_by_year.items():
        budget_scope_map.update(
            compute_budget_scope_statuses(
                session,
                year=scope_year,
                month_range=sorted(scope_months),
                scenario_id=scenario_id,
            )
        )
    return [
        _build_expense_read(
            row,
            department_map,
            plan_amount_map,
            budget_scope_map,
            attachment_count_map,
            allocation_map,
        )
        for row in row_maps
    ]


def _expense_read_query(
    capex_filter: str | None,
) -> select:
    created_user = aliased(User)
    updated_user = aliased(User)
    query = (
        select(
            Expense.id,
            Expense.budget_item_id,
            Expense.scenario_id,
            Expense.expense_date,
            Expense.amount,
            Expense.quantity,
            Expense.unit_price,
            Expense.vendor,
            Expense.description,
            Expense.status,
            Expense.is_out_of_budget,
            Expense.budget_outside_title,
            Expense.budget_outside_department,
            Expense.budget_outside_capex_opex,
            Expense.budget_outside_asset_type,
            Expense.budget_code.label("expense_budget_code"),
            Expense.created_at,
            Expense.updated_at,
            Expense.created_by_id,
            Expense.updated_by_id,
            Expense.created_by_user_id,
            Expense.updated_by_user_id,
            Expense.client_hostname,
            Expense.kaydi_giren_kullanici,
            BudgetItem.code.label("budget_code"),
            BudgetItem.name.label("budget_name"),
            BudgetItem.map_category.label("capex_opex"),
            BudgetItem.map_attribute.label("asset_type"),
            Scenario.name.label("scenario_name"),
            created_user.full_name.label("created_full_name"),
            created_user.username.label("created_username"),
            created_user.email.label("created_email"),
            updated_user.full_name.label("updated_full_name"),
            updated_user.username.label("updated_username"),
            updated_user.email.label("updated_email"),
        )
        .select_from(Expense)
        .outerjoin(
            BudgetItem,
            or_(
                and_(Expense.budget_code.is_not(None), BudgetItem.code == Expense.budget_code),
                and_(Expense.budget_code.is_(None), BudgetItem.id == Expense.budget_item_id),
            ),
        )
        .outerjoin(Scenario, Scenario.id == Expense.scenario_id)
        .outerjoin(
            created_user,
            created_user.id == func.coalesce(Expense.created_by_user_id, Expense.created_by_id),
        )
        .outerjoin(
            updated_user,
            updated_user.id == func.coalesce(Expense.updated_by_user_id, Expense.updated_by_id),
        )
    )
    if capex_filter:
        query = query.where(
            or_(
                func.lower(func.trim(BudgetItem.map_category)) == capex_filter,
                func.lower(func.trim(Expense.budget_outside_capex_opex)) == capex_filter,
            )
        )
    return query


def _fetch_expense_read(
    session: Session,
    expense_id: int,
    year: int | None = None,
    scenario_id: int | None = None,
) -> ExpenseRead:
    query = _expense_read_query(None).where(Expense.id == expense_id)
    row = session.exec(query).first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    return _build_expense_reads(session, [row], year, scenario_id)[0]


@router.get("", response_model=list[ExpenseRead])
@router.get("/", response_model=list[ExpenseRead], include_in_schema=False)
def list_expenses(
    year: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    month_list: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    include_out_of_budget: bool = Query(default=True),
    show_cancelled: bool = Query(default=False),
    show_out_of_budget: bool = Query(default=False),
    only_out_of_budget: bool = Query(default=False),
    mine_only: bool = Query(default=False),
    today_only: bool = Query(default=False),
    capex_opex: str | None = Query(default=None),
    department: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=100),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[ExpenseRead]:
    capex_filter = _normalize_capex_opex(capex_opex)
    selected_months = _parse_month_list(month_list)
    query = _expense_read_query(capex_filter)
    if today_only:
        query = query.where(Expense.expense_date == date.today())
    elif year is not None:
        query = query.where(Expense.expense_date >= date(year, 1, 1)).where(
            Expense.expense_date <= date(year, 12, 31)
        )
    if budget_item_id is not None:
        query = query.where(Expense.budget_item_id == budget_item_id)
    if scenario_id is not None:
        query = query.where(Expense.scenario_id == scenario_id)
    if department:
        department_budget_items = select(PlanEntry.budget_item_id).where(
            PlanEntry.department == department
        )
        if year is not None:
            department_budget_items = department_budget_items.where(PlanEntry.year == year)
        if scenario_id is not None:
            department_budget_items = department_budget_items.where(
                PlanEntry.scenario_id == scenario_id
            )
        query = query.where(
            or_(
                Expense.budget_item_id.in_(department_budget_items),
                Expense.budget_outside_department == department,
            )
        )
    if not today_only:
        if start_date is not None:
            query = query.where(Expense.expense_date >= start_date)
        if end_date is not None:
            query = query.where(Expense.expense_date <= end_date)
        if selected_months:
            query = query.where(func.extract("month", Expense.expense_date).in_(selected_months))
    if status_filter is not None:
        raw_statuses = [status_filter] if "," not in status_filter else status_filter.split(",")
        statuses = []
        for raw in raw_statuses:
            raw_clean = raw.strip().lower()
            try:
                statuses.append(ExpenseStatus(raw_clean))
            except ValueError:
                continue
        if statuses:
            query = query.where(Expense.status.in_(statuses))
    if not show_cancelled:
        query = query.where(Expense.status != ExpenseStatus.CANCELLED)
    if only_out_of_budget:
        query = query.where(Expense.is_out_of_budget.is_(True))
    elif not (include_out_of_budget and show_out_of_budget):
        query = query.where(Expense.is_out_of_budget.is_(False))
    if mine_only:
        query = query.where(
            func.coalesce(Expense.created_by_user_id, Expense.created_by_id) == current_user.id
        )
    try:
        ordered_query = query.order_by(Expense.expense_date.desc(), Expense.id.desc())
        if limit is not None:
            ordered_query = ordered_query.limit(limit)
        rows = session.exec(ordered_query).all()
    except Exception as exc:
        logger.exception("Failed to list expenses")
        raise HTTPException(
            status_code=500,
            detail=f"Harcama listesi alınırken bir hata oluştu: {exc}",
        )
    return _build_expense_reads(session, rows, year, scenario_id)


@router.post("/unused-budget", response_model=PlanEntryRead, status_code=201)
@router.post("/unused-budget/", response_model=PlanEntryRead, status_code=201, include_in_schema=False)
def create_unused_budget_entry(
    payload: ExpenseUnusedBudgetCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> PlanEntryRead:
    _ensure_expense_write_allowed(current_user)
    if not payload.scenario_id:
        raise HTTPException(status_code=400, detail="scenario_id is required")
    budget_item = session.get(BudgetItem, payload.budget_item_id)
    if not budget_item:
        raise HTTPException(status_code=400, detail="Budget item not found")
    if not session.get(Scenario, payload.scenario_id):
        raise HTTPException(status_code=400, detail="Invalid scenario_id")

    year = payload.expense_date.year
    month = payload.expense_date.month
    amount = round(float(payload.amount or 0), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Kullanılmayacak tutar 0'dan büyük olmalı.")

    plan = session.exec(
        select(PlanEntry)
        .where(PlanEntry.budget_item_id == payload.budget_item_id)
        .where(PlanEntry.year == year)
        .where(PlanEntry.month == month)
        .where(PlanEntry.scenario_id == payload.scenario_id)
        .order_by(PlanEntry.id)
    ).first()
    if not plan:
        raise HTTPException(
            status_code=404,
            detail="Bu bütçe kalemi için seçili ay/senaryoda plan bulunamadı.",
        )

    scope_map = compute_budget_scope_statuses(
        session,
        year=year,
        month_range=[month],
        scenario_id=payload.scenario_id,
        budget_item_id=payload.budget_item_id,
    )
    scope = scope_map.get((payload.budget_item_id, year, month, payload.scenario_id))
    revised_plan = float(scope.revised_plan if scope else plan.amount or 0)
    actual_amount = float(scope.actual if scope else 0)
    current_unused = float(scope.unused_amount if scope else plan.unused_amount or 0)
    available_amount = max(revised_plan - actual_amount - current_unused, 0.0)
    if amount > available_amount + 0.005:
        raise HTTPException(
            status_code=400,
            detail=(
                "Kullanılmayacak tutar kalan kullanılabilir bütçeden fazla olamaz. "
                f"Maksimum tutar: {available_amount:.2f}"
            ),
        )

    plan.unused_amount = round(float(plan.unused_amount or 0) + amount, 2)
    if payload.reason:
        plan.unused_reason = payload.reason
    if payload.note:
        plan.unused_note = payload.note
    plan.unused_updated_at = datetime.utcnow()
    plan.updated_at = datetime.utcnow()
    session.add(plan)
    try:
        session.commit()
        session.refresh(plan)
    except SQLAlchemyError as exc:
        session.rollback()
        detail = str(exc.orig) if getattr(exc, "orig", None) else "DB constraint error"
        raise HTTPException(status_code=400, detail=detail)

    return _fetch_plan_read(session, plan.id)


@router.post("", response_model=ExpenseRead, status_code=201)
@router.post("/", response_model=ExpenseRead, status_code=201, include_in_schema=False)
def create_expense(
    expense_in: ExpenseCreate,
    request: Request,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExpenseRead:
    _ensure_expense_write_allowed(current_user)
    if not expense_in.scenario_id:
        raise HTTPException(status_code=400, detail="scenario_id is required")
    budget_item = None
    if expense_in.is_out_of_budget:
        if not expense_in.budget_outside_title:
            raise HTTPException(status_code=400, detail="Butce disi harcama basligi zorunludur.")
    else:
        if not expense_in.budget_item_id:
            raise HTTPException(status_code=400, detail="Butce kalemi secmelisiniz.")
        budget_item = session.get(BudgetItem, expense_in.budget_item_id)
        if not budget_item:
            raise HTTPException(status_code=400, detail="Budget item not found")
    if not session.get(Scenario, expense_in.scenario_id):
        raise HTTPException(status_code=400, detail="Invalid scenario_id")
    client_hostname = expense_in.client_hostname or _extract_client_identifier(request)

    quantity = expense_in.quantity or 1
    unit_price = expense_in.unit_price or 0
    if expense_in.amount is None:
        expense_in.amount = round(quantity * unit_price, 2)

    mark_plan_purchased = False if expense_in.is_out_of_budget else expense_in.mark_plan_purchased
    expense_data = expense_in.dict(
        exclude={
            "client_hostname",
            "kaydi_giren_kullanici",
            "mark_plan_purchased",
            *ALLOCATION_INPUT_FIELDS,
        }
    )
    expense = Expense(
        **expense_data,
        budget_code=budget_item.code if budget_item else None,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
        client_hostname=client_hostname,
        kaydi_giren_kullanici=current_user.username,
    )
    allocation_data = _build_allocation_data(
        session,
        expense,
        expense_in.allocation_mode,
        expense_in.allocation_start_month,
        expense_in.allocation_month_count,
        expense_in.allocation_method,
    )
    try:
        session.add(expense)
        session.flush()
        _create_expense_allocations(session, expense, allocation_data)
        if mark_plan_purchased and expense.status == ExpenseStatus.RECORDED:
            scopes = _allocation_data_scopes(allocation_data) or _expense_plan_scopes(session, expense)
            for scope in scopes:
                _set_plan_purchase_status(session, scope, True, current_user.id)
        session.commit()
        session.refresh(expense)
    except SQLAlchemyError as exc:
        session.rollback()
        detail = str(exc.orig) if getattr(exc, "orig", None) else "DB constraint error"
        raise HTTPException(status_code=400, detail=detail)
    return _fetch_expense_read(session, expense.id, scenario_id=expense.scenario_id)


@router.put("/{expense_id}", response_model=ExpenseRead)
@router.put("/{expense_id}/", response_model=ExpenseRead, include_in_schema=False)
def update_expense(
    expense_id: int,
    expense_in: ExpenseUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExpenseRead:
    _ensure_expense_write_allowed(current_user)
    expense = session.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    owner_id = expense.created_by_user_id or expense.created_by_id
    if owner_id not in (None, current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    old_scopes = _expense_plan_scopes(session, expense)
    old_status = expense.status
    mark_plan_purchased = expense_in.mark_plan_purchased
    allocation_mode_supplied = "allocation_mode" in expense_in.__fields_set__
    update_data = expense_in.dict(
        exclude_unset=True,
        exclude={"mark_plan_purchased", *ALLOCATION_INPUT_FIELDS},
    )
    will_be_out_of_budget = bool(update_data.get("is_out_of_budget", expense.is_out_of_budget))
    if will_be_out_of_budget:
        update_data["budget_item_id"] = None
        update_data["budget_code"] = None
        effective_title = update_data.get("budget_outside_title", expense.budget_outside_title)
        if not effective_title:
            raise HTTPException(status_code=400, detail="Butce disi harcama basligi zorunludur.")
    else:
        effective_budget_item_id = update_data.get("budget_item_id", expense.budget_item_id)
        if not effective_budget_item_id:
            raise HTTPException(status_code=400, detail="Butce kalemi secmelisiniz.")

    if "budget_item_id" in update_data and update_data["budget_item_id"] is not None:
        budget_item = session.get(BudgetItem, update_data["budget_item_id"])
        if not budget_item:
            raise HTTPException(status_code=400, detail="Budget item not found")
        update_data["budget_code"] = budget_item.code
    elif not will_be_out_of_budget and expense.budget_code is None:
        budget_item = session.get(BudgetItem, expense.budget_item_id)
        if budget_item:
            update_data["budget_code"] = budget_item.code

    for field, value in update_data.items():
        if field == "kaydi_giren_kullanici":
            continue
        setattr(expense, field, value)

    quantity = expense.quantity or 1
    unit_price = expense.unit_price or 0
    if not expense.amount and quantity and unit_price:
        expense.amount = round(quantity * unit_price, 2)

    allocation_data = [] if will_be_out_of_budget else None
    if allocation_mode_supplied and not will_be_out_of_budget:
        allocation_data = _build_allocation_data(
            session,
            expense,
            expense_in.allocation_mode,
            expense_in.allocation_start_month,
            expense_in.allocation_month_count,
            expense_in.allocation_method,
        )

    expense.updated_by_user_id = current_user.id
    expense.updated_by_id = current_user.id
    expense.updated_at = datetime.utcnow()
    try:
        session.add(expense)
        session.flush()
        if allocation_data is not None:
            _delete_expense_allocations(session, expense.id)
            session.flush()
            _create_expense_allocations(session, expense, allocation_data)
        new_scopes = (
            _allocation_data_scopes(allocation_data)
            if allocation_data is not None
            else set()
        ) or _expense_plan_scopes(session, expense)
        synced_scopes: set[tuple[int, int, int, int]] = set()

        def sync_scope(scope: tuple[int, int, int, int] | None) -> None:
            if scope and scope not in synced_scopes:
                _sync_plan_purchase_status(session, scope, current_user.id)
                synced_scopes.add(scope)

        if old_scopes != new_scopes or (
            old_status == ExpenseStatus.RECORDED and expense.status != ExpenseStatus.RECORDED
        ):
            for scope in old_scopes:
                sync_scope(scope)
        if mark_plan_purchased is True and expense.status == ExpenseStatus.RECORDED and new_scopes:
            for scope in new_scopes:
                _set_plan_purchase_status(session, scope, True, current_user.id)
        elif expense.status != ExpenseStatus.RECORDED:
            for scope in new_scopes:
                sync_scope(scope)
        session.commit()
        session.refresh(expense)
    except SQLAlchemyError as exc:
        session.rollback()
        detail = str(exc.orig) if getattr(exc, "orig", None) else "DB constraint error"
        raise HTTPException(status_code=400, detail=detail)
    return _fetch_expense_read(session, expense.id, scenario_id=expense.scenario_id)


def _get_deletable_expense(
    session: Session,
    expense_id: int,
    current_user: User,
) -> Expense:
    expense = session.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    owner_id = expense.created_by_user_id or expense.created_by_id
    if owner_id not in (None, current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    return expense


def _safe_attachment_filename(file_name: str | None) -> str:
    if not file_name:
        return "fatura.pdf"
    sanitized = file_name.replace("\\", "_").replace("/", "_").replace('"', "")
    return sanitized or "fatura.pdf"


def _attachment_content_disposition(file_name: str, disposition: str = "attachment") -> str:
    fallback_name = file_name.encode("ascii", "ignore").decode("ascii")
    fallback_name = fallback_name.replace("\\", "_").replace("/", "_").replace('"', "")
    fallback_name = re.sub(r"[^A-Za-z0-9._ -]+", "_", fallback_name).strip(" .")
    fallback_name = re.sub(r"_+", "_", fallback_name) or "fatura.pdf"
    encoded_name = quote(file_name, safe="")
    return f"{disposition}; filename=\"{fallback_name}\"; filename*=UTF-8''{encoded_name}"


def _get_attachment_expense(
    session: Session,
    expense_id: int,
    current_user: User,
) -> Expense:
    expense = session.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Harcama bulunamadı.")
    owner_id = expense.created_by_user_id or expense.created_by_id
    if (
        owner_id not in (None, current_user.id)
        and not current_user.is_admin
        and not is_viewer_user(current_user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu harcama ekine erişim yetkiniz yok.",
        )
    return expense


@router.get("/{expense_id}/attachments", response_model=list[ExpenseAttachmentRead])
@router.get("/{expense_id}/attachments/", response_model=list[ExpenseAttachmentRead], include_in_schema=False)
def list_expense_attachments(
    expense_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[ExpenseAttachment]:
    _get_attachment_expense(session, expense_id, current_user)
    return session.exec(
        select(ExpenseAttachment)
        .where(ExpenseAttachment.expense_id == expense_id)
        .order_by(ExpenseAttachment.created_at.desc())
    ).all()


@router.post(
    "/{expense_id}/attachments",
    response_model=ExpenseAttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/{expense_id}/attachments/",
    response_model=ExpenseAttachmentRead,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def upload_expense_attachment(
    expense_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExpenseAttachment:
    _ensure_expense_write_allowed(current_user)
    _get_deletable_expense(session, expense_id, current_user)
    file_name = _safe_attachment_filename(file.filename)
    content_type = file.content_type or "application/octet-stream"
    if not file_name.lower().endswith(".pdf") and content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sadece PDF fatura eki yuklenebilir.",
        )
    content = file.file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Yuklenen dosya bos.",
        )
    attachment = ExpenseAttachment(
        expense_id=expense_id,
        file_name=file_name,
        content_type="application/pdf",
        size_bytes=len(content),
        content=content,
        uploaded_by_id=current_user.id,
    )
    session.add(attachment)
    session.commit()
    session.refresh(attachment)
    return attachment


@router.post(
    "/{expense_id}/attachments/batch",
    response_model=list[ExpenseAttachmentRead],
    status_code=status.HTTP_201_CREATED,
)
@router.post(
    "/{expense_id}/attachments/batch/",
    response_model=list[ExpenseAttachmentRead],
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
def upload_expense_attachments(
    expense_id: int,
    files: list[UploadFile] = File(...),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[ExpenseAttachment]:
    _ensure_expense_write_allowed(current_user)
    _get_deletable_expense(session, expense_id, current_user)
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="En az bir PDF dosyasi secmelisiniz.",
        )

    attachments: list[ExpenseAttachment] = []
    for file in files:
        file_name = _safe_attachment_filename(file.filename)
        content_type = file.content_type or "application/octet-stream"
        if not file_name.lower().endswith(".pdf") and content_type != "application/pdf":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sadece PDF fatura eki yuklenebilir: {file_name}",
            )
        content = file.file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Yuklenen dosya bos: {file_name}",
            )
        attachments.append(
            ExpenseAttachment(
                expense_id=expense_id,
                file_name=file_name,
                content_type="application/pdf",
                size_bytes=len(content),
                content=content,
                uploaded_by_id=current_user.id,
            )
        )

    session.add_all(attachments)
    session.commit()
    for attachment in attachments:
        session.refresh(attachment)
    return attachments


@router.get("/{expense_id}/attachments/{attachment_id}")
@router.get("/{expense_id}/attachments/{attachment_id}/", include_in_schema=False)
def download_expense_attachment(
    expense_id: int,
    attachment_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    _get_attachment_expense(session, expense_id, current_user)
    attachment = session.exec(
        select(ExpenseAttachment)
        .where(ExpenseAttachment.id == attachment_id)
        .where(ExpenseAttachment.expense_id == expense_id)
    ).first()
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ek dosya bulunamadı veya bu harcamaya bağlı değil.",
        )
    file_name = _safe_attachment_filename(attachment.file_name)
    if not attachment.content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dosya sunucuda bulunamadı veya dosya içeriği boş.",
        )
    return Response(
        content=attachment.content,
        media_type=attachment.content_type or "application/pdf",
        headers={
            "Content-Disposition": _attachment_content_disposition(file_name),
            "Content-Length": str(len(attachment.content)),
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get("/{expense_id}/attachments/{attachment_id}/preview")
@router.get("/{expense_id}/attachments/{attachment_id}/preview/", include_in_schema=False)
def preview_expense_attachment(
    expense_id: int,
    attachment_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    _get_attachment_expense(session, expense_id, current_user)
    attachment = session.exec(
        select(ExpenseAttachment)
        .where(ExpenseAttachment.id == attachment_id)
        .where(ExpenseAttachment.expense_id == expense_id)
    ).first()
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ek dosya bulunamadı veya bu harcamaya bağlı değil.",
        )
    file_name = _safe_attachment_filename(attachment.file_name)
    if not attachment.content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dosya sunucuda bulunamadı veya dosya içeriği boş.",
        )
    return Response(
        content=attachment.content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": _attachment_content_disposition(file_name, "inline"),
            "Content-Length": str(len(attachment.content)),
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.delete("/{expense_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete(
    "/{expense_id}/attachments/{attachment_id}/",
    status_code=status.HTTP_204_NO_CONTENT,
    include_in_schema=False,
)
def delete_expense_attachment(
    expense_id: int,
    attachment_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    _ensure_expense_write_allowed(current_user)
    _get_attachment_expense(session, expense_id, current_user)
    attachment = session.exec(
        select(ExpenseAttachment)
        .where(ExpenseAttachment.id == attachment_id)
        .where(ExpenseAttachment.expense_id == expense_id)
    ).first()
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ek dosya bulunamadı veya bu harcamaya bağlı değil.",
        )

    try:
        session.delete(attachment)
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        logger.exception(
            "Failed to delete expense attachment",
            extra={"expense_id": expense_id, "attachment_id": attachment_id},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ek dosya silinirken beklenmedik bir hata oluştu.",
        )


@router.get("/{expense_id}/delete-info", response_model=DeleteDependencyInfo)
@router.get("/{expense_id}/delete-info/", response_model=DeleteDependencyInfo, include_in_schema=False)
def get_expense_delete_info(
    expense_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> DeleteDependencyInfo:
    _get_deletable_expense(session, expense_id, current_user)
    return DeleteDependencyInfo(
        related_file_count=count_related_file_records(session, "expenses", expense_id)
    )


@router.delete("/{expense_id}", status_code=204)
@router.delete("/{expense_id}/", status_code=204, include_in_schema=False)
def delete_expense(
    expense_id: int,
    delete_related: bool = Query(False),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    _ensure_expense_write_allowed(current_user)
    expense = _get_deletable_expense(session, expense_id, current_user)
    related_file_count = count_related_file_records(session, "expenses", expense_id)
    if related_file_count and not delete_related:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Bu kayda bağlı {related_file_count} ek/dosya var. "
                "Silmeden önce onay verin."
            ),
    )

    try:
        scopes = _expense_plan_scopes(session, expense)
        if delete_related:
            delete_related_file_records(session, "expenses", expense_id)
        _delete_expense_allocations(session, expense_id)
        session.delete(expense)
        session.flush()
        for scope in scopes:
            _sync_plan_purchase_status(session, scope, current_user.id)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=400,
            detail="Harcama kaydı bağlı başka veriler nedeniyle silinemedi.",
        )
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Failed to delete expense", extra={"expense_id": expense_id})
        raise HTTPException(
            status_code=400,
            detail="Harcama kaydı silinirken beklenmedik bir hata oluştu.",
        )
