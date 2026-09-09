from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable

from sqlalchemy import exists, or_
from sqlmodel import Session, func, select

from app.models import (
    BudgetItem,
    BudgetTransfer,
    Expense,
    ExpenseAllocation,
    ExpenseStatus,
    PlanEntry,
    PurchaseFormStatusExt,
)


@dataclass
class MonthlyAggregate:
    month: int
    planned: float
    actual: float
    unused: float = 0.0
    negotiated_saving: float = 0.0
    cancelled: float = 0.0
    cancelled_budget: float = 0.0

    @property
    def saving(self) -> float:
        return max(self.negotiated_saving, 0.0)

    @property
    def remaining(self) -> float:
        return max(self.planned - self.actual - self.unused - self.cancelled_budget, 0.0)


@dataclass
class QuarterlyAggregate:
    quarter: int
    planned: float
    actual: float
    unused: float
    out_of_budget: float
    cancelled: float
    negotiated_saving: float = 0.0

    @property
    def saving(self) -> float:
        return max(self.negotiated_saving, 0.0)


BudgetScopeKey = tuple[int, int, int, int | None]


def _normalize_capex_opex(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    return normalized if normalized in {"capex", "opex"} else None


def _format_capex_opex(value: str | None) -> str | None:
    normalized = _normalize_capex_opex(value)
    if normalized == "capex":
        return "Capex"
    if normalized == "opex":
        return "Opex"
    return "Sınıflandırılmamış"


def _capex_opex_column():
    return func.lower(func.trim(BudgetItem.map_category))


@dataclass
class BudgetScopeAggregate:
    revised_plan: float = 0.0
    actual: float = 0.0
    unused_amount: float = 0.0
    cancelled_amount: float = 0.0
    is_purchased: bool = False
    departments: set[str] = field(default_factory=set)


@dataclass
class BudgetItemStatus:
    budget_item_id: int
    budget_code: str
    budget_name: str
    scenario_id: int | None
    months: list[int]
    capex_opex: str | None
    asset_type: str | None
    department: str | None
    revised_plan: float
    actual: float
    overall_revised_plan: float
    overall_actual: float
    unused_amount: float
    overall_unused_amount: float
    available_amount: float
    overall_available_amount: float
    difference: float
    category: str


@dataclass
class BudgetReconciliationSummary:
    total_plan_amount: float
    capex_total_plan_amount: float
    opex_total_plan_amount: float
    unclassified_total_plan_amount: float
    realized_plan_inside_amount: float
    capex_realized_plan_inside_amount: float
    opex_realized_plan_inside_amount: float
    unclassified_realized_plan_inside_amount: float
    remaining_available_amount: float
    capex_remaining_available_amount: float
    opex_remaining_available_amount: float
    unclassified_remaining_available_amount: float
    negotiated_saving_amount: float
    capex_negotiated_saving_amount: float
    opex_negotiated_saving_amount: float
    unclassified_negotiated_saving_amount: float
    other_saving_amount: float
    capex_other_saving_amount: float
    opex_other_saving_amount: float
    unclassified_other_saving_amount: float
    canceled_budget_amount: float
    capex_canceled_budget_amount: float
    opex_canceled_budget_amount: float
    unclassified_canceled_budget_amount: float
    overrun_amount: float
    capex_overrun_amount: float
    opex_overrun_amount: float
    unclassified_overrun_amount: float
    budget_outside_amount: float
    capex_budget_outside_amount: float
    opex_budget_outside_amount: float
    unclassified_budget_outside_amount: float
    reconciliation_total: float
    capex_reconciliation_total: float
    opex_reconciliation_total: float
    unclassified_reconciliation_total: float
    reconciliation_difference: float
    capex_reconciliation_difference: float
    opex_reconciliation_difference: float
    unclassified_reconciliation_difference: float


@dataclass
class BudgetReconciliationGroup:
    budget_item_id: int
    scenario_id: int | None
    capex_opex: str | None
    months: list[int]
    departments: set[str]
    total_plan_amount: float
    actual_amount: float
    realized_plan_inside_amount: float
    remaining_available_amount: float
    negotiated_saving_amount: float
    other_saving_amount: float
    canceled_budget_amount: float
    overrun_amount: float


def calculate_scoped_overrun(
    monthly_totals: list[tuple[float, float]], *, monthly_scope: bool
) -> float:
    """Apply total-item or positive-month overrun semantics without cross-item offsets."""

    if monthly_scope:
        return round(sum(max(actual - plan, 0.0) for plan, actual in monthly_totals), 2)
    total_plan = sum(plan for plan, _ in monthly_totals)
    total_actual = sum(actual for _, actual in monthly_totals)
    return round(max(total_actual - total_plan, 0.0), 2)


def compute_budget_scope_statuses(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> dict[BudgetScopeKey, BudgetScopeAggregate]:
    months = sorted({month for month in month_range if 1 <= month <= 12})
    if not months:
        return {}

    capex_filter = _normalize_capex_opex(capex_opex)
    scope_map: dict[BudgetScopeKey, BudgetScopeAggregate] = {}

    plan_query = (
        select(PlanEntry)
        .where(PlanEntry.year == year)
        .where(PlanEntry.month.in_(months))
    )
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    if department is not None:
        plan_query = plan_query.where(PlanEntry.department == department)
    if capex_filter:
        plan_query = plan_query.join(
            BudgetItem, BudgetItem.id == PlanEntry.budget_item_id
        ).where(_capex_opex_column() == capex_filter)

    plan_rows = session.exec(plan_query).all()
    plan_budget_ids = {plan.budget_item_id for plan in plan_rows}
    plan_item_map = {
        item.id: item
        for item in session.exec(
            select(BudgetItem).where(BudgetItem.id.in_(plan_budget_ids or {0}))
        ).all()
    }
    status_query = (
        select(PurchaseFormStatusExt)
        .where(PurchaseFormStatusExt.year == year)
        .where(PurchaseFormStatusExt.month.in_(months))
        .where(PurchaseFormStatusExt.is_form_prepared.is_(True))
    )
    if scenario_id is not None:
        status_query = status_query.where(PurchaseFormStatusExt.scenario_id == scenario_id)
    status_rows = session.exec(status_query).all()
    prepared_status_keys = {
        (
            (status.budget_code or "").strip().upper(),
            status.year,
            status.month,
            status.scenario_id,
            status.department or "",
        )
        for status in status_rows
        if (status.budget_code or "").strip()
    }
    for plan in plan_rows:
        key = (plan.budget_item_id, plan.year, plan.month, plan.scenario_id)
        scope = scope_map.setdefault(key, BudgetScopeAggregate())
        scope.revised_plan += float(plan.amount or 0)
        scope.unused_amount += float(plan.unused_amount or 0)
        item = plan_item_map.get(plan.budget_item_id)
        budget_code = (plan.budget_code or (item.code if item else "") or "").strip().upper()
        if (
            budget_code,
            plan.year,
            plan.month,
            plan.scenario_id,
            plan.department or "",
        ) in prepared_status_keys:
            scope.is_purchased = True
        if plan.department:
            scope.departments.add(plan.department)

    department_budget_ids: set[int] | None = None
    if department is not None:
        department_query = (
            select(PlanEntry.budget_item_id)
            .where(PlanEntry.year == year)
            .where(PlanEntry.month.in_(months))
            .where(PlanEntry.department == department)
        )
        if scenario_id is not None:
            department_query = department_query.where(
                PlanEntry.scenario_id == scenario_id
            )
        department_budget_ids = set(session.exec(department_query).all())

    allocation_query = (
        select(
            ExpenseAllocation.budget_item_id,
            ExpenseAllocation.year,
            ExpenseAllocation.month,
            ExpenseAllocation.scenario_id,
            func.sum(ExpenseAllocation.allocated_amount).label("actual_total"),
        )
        .select_from(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(ExpenseAllocation.year == year)
        .where(ExpenseAllocation.month.in_(months))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
    )
    fallback_query = (
        select(
            Expense.budget_item_id,
            func.extract("year", Expense.expense_date).label("year"),
            func.extract("month", Expense.expense_date).label("month"),
            Expense.scenario_id,
            func.sum(Expense.amount).label("actual_total"),
        )
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date).in_(months))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(~exists().where(ExpenseAllocation.expense_id == Expense.id))
    )
    if scenario_id is not None:
        allocation_query = allocation_query.where(
            ExpenseAllocation.scenario_id == scenario_id
        )
        fallback_query = fallback_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        allocation_query = allocation_query.where(
            ExpenseAllocation.budget_item_id == budget_item_id
        )
        fallback_query = fallback_query.where(
            Expense.budget_item_id == budget_item_id
        )
    if department_budget_ids is not None:
        allocation_query = allocation_query.where(
            ExpenseAllocation.budget_item_id.in_(department_budget_ids or {0})
        )
        fallback_query = fallback_query.where(
            Expense.budget_item_id.in_(department_budget_ids or {0})
        )
    if capex_filter:
        allocation_query = allocation_query.join(
            BudgetItem, BudgetItem.id == ExpenseAllocation.budget_item_id
        ).where(_capex_opex_column() == capex_filter)
        fallback_query = fallback_query.join(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(_capex_opex_column() == capex_filter)

    allocation_rows = session.exec(
        allocation_query.group_by(
            ExpenseAllocation.budget_item_id,
            ExpenseAllocation.year,
            ExpenseAllocation.month,
            ExpenseAllocation.scenario_id,
        )
    ).all()
    fallback_rows = session.exec(
        fallback_query.group_by(
            Expense.budget_item_id,
            func.extract("year", Expense.expense_date),
            func.extract("month", Expense.expense_date),
            Expense.scenario_id,
        )
    ).all()

    for row in [*allocation_rows, *fallback_rows]:
        key = (
            int(row.budget_item_id),
            int(row.year),
            int(row.month),
            row.scenario_id,
        )
        scope_map.setdefault(key, BudgetScopeAggregate()).actual += float(
            row.actual_total or 0
        )

    cancelled_allocation_query = (
        select(
            ExpenseAllocation.budget_item_id,
            ExpenseAllocation.year,
            ExpenseAllocation.month,
            ExpenseAllocation.scenario_id,
            func.sum(ExpenseAllocation.allocated_amount).label("cancelled_total"),
        )
        .select_from(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(ExpenseAllocation.year == year)
        .where(ExpenseAllocation.month.in_(months))
        .where(Expense.status == ExpenseStatus.CANCELLED)
        .where(Expense.is_out_of_budget.is_(False))
    )
    cancelled_fallback_query = (
        select(
            Expense.budget_item_id,
            func.extract("year", Expense.expense_date).label("year"),
            func.extract("month", Expense.expense_date).label("month"),
            Expense.scenario_id,
            func.sum(Expense.amount).label("cancelled_total"),
        )
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date).in_(months))
        .where(Expense.status == ExpenseStatus.CANCELLED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(~exists().where(ExpenseAllocation.expense_id == Expense.id))
    )
    if scenario_id is not None:
        cancelled_allocation_query = cancelled_allocation_query.where(
            ExpenseAllocation.scenario_id == scenario_id
        )
        cancelled_fallback_query = cancelled_fallback_query.where(
            Expense.scenario_id == scenario_id
        )
    if budget_item_id is not None:
        cancelled_allocation_query = cancelled_allocation_query.where(
            ExpenseAllocation.budget_item_id == budget_item_id
        )
        cancelled_fallback_query = cancelled_fallback_query.where(
            Expense.budget_item_id == budget_item_id
        )
    if department_budget_ids is not None:
        cancelled_allocation_query = cancelled_allocation_query.where(
            ExpenseAllocation.budget_item_id.in_(department_budget_ids or {0})
        )
        cancelled_fallback_query = cancelled_fallback_query.where(
            Expense.budget_item_id.in_(department_budget_ids or {0})
        )
    if capex_filter:
        cancelled_allocation_query = cancelled_allocation_query.join(
            BudgetItem, BudgetItem.id == ExpenseAllocation.budget_item_id
        ).where(_capex_opex_column() == capex_filter)
        cancelled_fallback_query = cancelled_fallback_query.join(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(_capex_opex_column() == capex_filter)

    cancelled_allocation_rows = session.exec(
        cancelled_allocation_query.group_by(
            ExpenseAllocation.budget_item_id,
            ExpenseAllocation.year,
            ExpenseAllocation.month,
            ExpenseAllocation.scenario_id,
        )
    ).all()
    cancelled_fallback_rows = session.exec(
        cancelled_fallback_query.group_by(
            Expense.budget_item_id,
            func.extract("year", Expense.expense_date),
            func.extract("month", Expense.expense_date),
            Expense.scenario_id,
        )
    ).all()

    for row in [*cancelled_allocation_rows, *cancelled_fallback_rows]:
        key = (
            int(row.budget_item_id),
            int(row.year),
            int(row.month),
            row.scenario_id,
        )
        scope_map.setdefault(key, BudgetScopeAggregate()).cancelled_amount += float(
            row.cancelled_total or 0
        )

    transfer_query = select(BudgetTransfer).where(
        BudgetTransfer.is_cancelled.is_(False)
    )
    if scenario_id is not None:
        transfer_query = transfer_query.where(
            (BudgetTransfer.source_scenario_id == scenario_id)
            | (BudgetTransfer.target_scenario_id == scenario_id)
        )
    transfers = session.exec(transfer_query).all()
    transfer_budget_ids = {
        transfer.source_budget_item_id
        for transfer in transfers
        if transfer.source_year == year and transfer.source_month in months
    } | {
        transfer.target_budget_item_id
        for transfer in transfers
        if transfer.target_year == year and transfer.target_month in months
    }
    transfer_items = {
        item.id: item
        for item in session.exec(
            select(BudgetItem).where(
                BudgetItem.id.in_(transfer_budget_ids or {0})
            )
        ).all()
    }

    def include_transfer_side(
        item_id: int, transfer_month: int, transfer_scenario_id: int
    ) -> bool:
        if transfer_month not in months:
            return False
        if scenario_id is not None and transfer_scenario_id != scenario_id:
            return False
        if budget_item_id is not None and item_id != budget_item_id:
            return False
        if department_budget_ids is not None and item_id not in department_budget_ids:
            return False
        if capex_filter:
            item = transfer_items.get(item_id)
            if not item or _normalize_capex_opex(item.map_category) != capex_filter:
                return False
        return True

    for transfer in transfers:
        if transfer.source_year == year and include_transfer_side(
            transfer.source_budget_item_id,
            transfer.source_month,
            transfer.source_scenario_id,
        ):
            key = (
                transfer.source_budget_item_id,
                transfer.source_year,
                transfer.source_month,
                transfer.source_scenario_id,
            )
            scope_map.setdefault(key, BudgetScopeAggregate()).revised_plan -= float(
                transfer.amount or 0
            )
        if transfer.target_year == year and include_transfer_side(
            transfer.target_budget_item_id,
            transfer.target_month,
            transfer.target_scenario_id,
        ):
            key = (
                transfer.target_budget_item_id,
                transfer.target_year,
                transfer.target_month,
                transfer.target_scenario_id,
            )
            scope_map.setdefault(key, BudgetScopeAggregate()).revised_plan += float(
                transfer.amount or 0
            )

    return scope_map


def compute_budget_item_statuses(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> list[BudgetItemStatus]:
    scope_map = compute_budget_scope_statuses(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
    )
    grouped_scopes: dict[
        tuple[int, int | None], list[tuple[int, BudgetScopeAggregate]]
    ] = {}
    for (item_id, _year, month, item_scenario_id), scope in scope_map.items():
        key = (item_id, item_scenario_id)
        grouped_scopes.setdefault(key, []).append((month, scope))

    item_ids = {item_id for item_id, _ in grouped_scopes}
    item_map = {
        item.id: item
        for item in session.exec(
            select(BudgetItem).where(BudgetItem.id.in_(item_ids or {0}))
        ).all()
    }
    statuses: list[BudgetItemStatus] = []
    for (item_id, item_scenario_id), item_scopes in grouped_scopes.items():
        overall_revised_plan = round(
            sum(float(scope.revised_plan or 0) for _, scope in item_scopes), 2
        )
        overall_actual = round(
            sum(float(scope.actual or 0) for _, scope in item_scopes), 2
        )
        overall_unused_amount = round(
            sum(float(scope.unused_amount or 0) for _, scope in item_scopes), 2
        )
        overall_cancelled_amount = round(
            sum(float(scope.cancelled_amount or 0) for _, scope in item_scopes), 2
        )
        overall_available_amount = round(
            max(
                overall_revised_plan
                - overall_actual
                - overall_unused_amount
                - overall_cancelled_amount,
                0.0,
            ),
            2,
        )
        departments = {
            value
            for _, scope in item_scopes
            for value in scope.departments
        }
        def scoped_totals(scopes: list[tuple[int, BudgetScopeAggregate]]) -> tuple[float, float, float, float]:
            scoped_plan = round(
                sum(float(scope.revised_plan or 0) for _, scope in scopes), 2
            )
            scoped_actual = round(
                sum(float(scope.actual or 0) for _, scope in scopes), 2
            )
            scoped_unused = round(
                sum(float(scope.unused_amount or 0) for _, scope in scopes), 2
            )
            scoped_cancelled = round(
                sum(float(scope.cancelled_amount or 0) for _, scope in scopes), 2
            )
            scoped_available = round(
                max(scoped_plan - scoped_actual - scoped_unused - scoped_cancelled, 0.0), 2
            )
            return scoped_plan, scoped_actual, scoped_unused, scoped_available

        actual_scopes = [
            (month, scope)
            for month, scope in item_scopes
            if float(scope.actual or 0) > 0.005
        ]
        unused_scopes = [
            (month, scope)
            for month, scope in item_scopes
            if float(scope.unused_amount or 0) > 0.005
        ]
        overrun_scopes = [
            (month, scope)
            for month, scope in item_scopes
            if float(scope.actual or 0) > float(scope.revised_plan or 0) + 0.005
        ]
        status_scopes = item_scopes
        if overrun_scopes:
            category = "overrun"
            status_scopes = overrun_scopes
            revised_plan, actual, unused_amount, available_amount = scoped_totals(
                status_scopes
            )
            difference = round(
                sum(
                    float(scope.actual or 0) - float(scope.revised_plan or 0)
                    for _, scope in overrun_scopes
                ),
                2,
            )
            available_amount = 0.0
            status_months = sorted({month for month, _ in overrun_scopes})
        elif unused_scopes:
            status_scopes = unused_scopes
            revised_plan, actual, unused_amount, available_amount = scoped_totals(
                status_scopes
            )
            difference = available_amount
            status_months = sorted({month for month, _ in status_scopes})
            category = "remaining" if available_amount > 0.005 else "balanced"
        elif abs(overall_actual) < 0.005 and overall_revised_plan > 0:
            revised_plan = overall_revised_plan
            actual = overall_actual
            unused_amount = overall_unused_amount
            available_amount = overall_available_amount
            category = "remaining" if available_amount > 0.005 else "balanced"
            difference = available_amount if category == "remaining" else 0.0
            status_months = sorted({month for month, _ in item_scopes})
        elif actual_scopes:
            status_scopes = actual_scopes
            revised_plan, actual, unused_amount, available_amount = scoped_totals(
                status_scopes
            )
            status_months = sorted({month for month, _ in status_scopes})
            if actual < revised_plan - 0.005:
                category = "saving"
                difference = round(revised_plan - actual, 2)
            else:
                category = "balanced"
                difference = 0.0
            if category == "saving" and not any(
                scope.is_purchased for _, scope in status_scopes
            ):
                category = "remaining"
                difference = available_amount
        else:
            category = "balanced"
            revised_plan = overall_revised_plan
            actual = overall_actual
            unused_amount = overall_unused_amount
            available_amount = overall_available_amount
            difference = 0.0
            status_months = sorted({month for month, _ in item_scopes})

        item = item_map.get(item_id)
        status_departments = {
            value
            for _, scope in status_scopes
            for value in scope.departments
        } or departments
        statuses.append(
            BudgetItemStatus(
                budget_item_id=item_id,
                budget_code=item.code if item else "",
                budget_name=item.name if item else "",
                scenario_id=item_scenario_id,
                months=status_months,
                capex_opex=_format_capex_opex(item.map_category if item else None),
                asset_type=item.map_attribute if item else None,
                department=", ".join(sorted(status_departments)) or None,
                revised_plan=revised_plan,
                actual=actual,
                overall_revised_plan=overall_revised_plan,
                overall_actual=overall_actual,
                unused_amount=unused_amount,
                overall_unused_amount=overall_unused_amount,
                available_amount=available_amount,
                overall_available_amount=overall_available_amount,
                difference=round(difference, 2),
                category=category,
            )
        )
    return statuses


def compute_budget_item_overrun_statuses(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
    monthly_scope: bool = False,
) -> list[BudgetItemStatus]:
    """Return overrun rows from the selected scope total, not month-by-month positives."""
    scope_map = compute_budget_scope_statuses(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
    )
    grouped_scopes: dict[
        tuple[int, int | None], list[tuple[int, BudgetScopeAggregate]]
    ] = {}
    for (item_id, _year, month, item_scenario_id), scope in scope_map.items():
        key = (item_id, item_scenario_id)
        grouped_scopes.setdefault(key, []).append((month, scope))

    item_ids = {item_id for item_id, _ in grouped_scopes}
    item_map = {
        item.id: item
        for item in session.exec(
            select(BudgetItem).where(BudgetItem.id.in_(item_ids or {0}))
        ).all()
    }

    statuses: list[BudgetItemStatus] = []
    status_groups = (
        [((item_id, scenario_id), [(month, scope)]) for (item_id, _year, month, scenario_id), scope in scope_map.items()]
        if monthly_scope
        else list(grouped_scopes.items())
    )
    for (item_id, item_scenario_id), item_scopes in status_groups:
        revised_plan = round(
            sum(float(scope.revised_plan or 0) for _, scope in item_scopes), 2
        )
        actual = round(
            sum(float(scope.actual or 0) for _, scope in item_scopes), 2
        )
        unused_amount = round(
            sum(float(scope.unused_amount or 0) for _, scope in item_scopes), 2
        )
        cancelled_amount = round(
            sum(float(scope.cancelled_amount or 0) for _, scope in item_scopes), 2
        )
        difference = round(max(actual - revised_plan, 0.0), 2)
        if difference <= 0.005:
            continue

        item = item_map.get(item_id)
        departments = {
            value
            for _, scope in item_scopes
            for value in scope.departments
        }
        statuses.append(
            BudgetItemStatus(
                budget_item_id=item_id,
                budget_code=item.code if item else "",
                budget_name=item.name if item else "",
                scenario_id=item_scenario_id,
                months=sorted({month for month, _ in item_scopes}),
                capex_opex=_format_capex_opex(item.map_category if item else None),
                asset_type=item.map_attribute if item else None,
                department=", ".join(sorted(departments)) or None,
                revised_plan=revised_plan,
                actual=actual,
                overall_revised_plan=revised_plan,
                overall_actual=actual,
                unused_amount=unused_amount,
                overall_unused_amount=unused_amount,
                available_amount=0.0,
                overall_available_amount=round(
                    max(revised_plan - actual - unused_amount - cancelled_amount, 0.0), 2
                ),
                difference=difference,
                category="overrun",
            )
        )
    return statuses


def compute_negotiated_saving_statuses(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> list[BudgetItemStatus]:
    """Return month-level positive saving rows for active in-plan spend.

    This is intentionally month/scope based instead of item-summary based:
    a budget item can have overrun in one month and saving in another month.
    Positive savings must still be counted for the saving months, while
    overruns remain in the overrun card.
    """
    scope_map = compute_budget_scope_statuses(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
    )
    item_ids = {item_id for item_id, _year, _month, _scenario_id in scope_map}
    item_map = {
        item.id: item
        for item in session.exec(
            select(BudgetItem).where(BudgetItem.id.in_(item_ids or {0}))
        ).all()
    }

    statuses: list[BudgetItemStatus] = []
    for (item_id, _year, month, item_scenario_id), scope in sorted(scope_map.items()):
        revised_plan = round(float(scope.revised_plan or 0), 2)
        actual = round(float(scope.actual or 0), 2)
        unused_amount = round(float(scope.unused_amount or 0), 2)
        cancelled_amount = round(float(scope.cancelled_amount or 0), 2)
        available_amount = round(
            max(revised_plan - actual - unused_amount - cancelled_amount, 0.0), 2
        )
        negotiated_saving = round(
            revised_plan - actual - unused_amount - cancelled_amount, 2
        )

        # Saving is only a positive, realized in-plan difference. No-spend rows,
        # overrun rows, budget-outside rows and unused-budget amounts do not belong here.
        if revised_plan <= 0.005:
            continue
        if actual <= 0.005:
            continue
        if not scope.is_purchased:
            continue
        if negotiated_saving <= 0.005:
            continue

        item = item_map.get(item_id)
        departments = {value for value in scope.departments if value}
        statuses.append(
            BudgetItemStatus(
                budget_item_id=item_id,
                budget_code=item.code if item else "",
                budget_name=item.name if item else "",
                scenario_id=item_scenario_id,
                months=[month],
                capex_opex=_format_capex_opex(item.map_category if item else None),
                asset_type=item.map_attribute if item else None,
                department=", ".join(sorted(departments)) or None,
                revised_plan=revised_plan,
                actual=actual,
                overall_revised_plan=revised_plan,
                overall_actual=actual,
                unused_amount=unused_amount,
                overall_unused_amount=unused_amount,
                available_amount=available_amount,
                overall_available_amount=available_amount,
                difference=negotiated_saving,
                category="saving",
            )
        )
    return statuses


def _compute_budget_reconciliation_groups(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
    monthly_overrun: bool = False,
) -> list[BudgetReconciliationGroup]:
    scope_map = compute_budget_scope_statuses(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
    )
    saving_statuses = compute_negotiated_saving_statuses(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
    )
    negotiated_by_group: dict[tuple[int, int | None], float] = defaultdict(float)
    for status in saving_statuses:
        negotiated_by_group[(status.budget_item_id, status.scenario_id)] += float(
            status.difference or 0.0
        )

    grouped_scopes: dict[
        tuple[int, int | None], list[tuple[int, BudgetScopeAggregate]]
    ] = defaultdict(list)
    for (item_id, _year, month, item_scenario_id), scope in scope_map.items():
        grouped_scopes[(item_id, item_scenario_id)].append((month, scope))
    item_ids = {item_id for item_id, _ in grouped_scopes}
    item_map = {
        item.id: item
        for item in session.exec(
            select(BudgetItem).where(BudgetItem.id.in_(item_ids or {0}))
        ).all()
    }

    groups: list[BudgetReconciliationGroup] = []
    for group_key, scopes in grouped_scopes.items():
        item_id, item_scenario_id = group_key
        item = item_map.get(item_id)
        plan_amount = max(
            round(sum(float(scope.revised_plan or 0.0) for _, scope in scopes), 2),
            0.0,
        )
        actual_amount = max(
            round(sum(float(scope.actual or 0.0) for _, scope in scopes), 2),
            0.0,
        )
        unused_amount = max(
            round(sum(float(scope.unused_amount or 0.0) for _, scope in scopes), 2),
            0.0,
        )
        cancelled_amount = max(
            round(sum(float(scope.cancelled_amount or 0.0) for _, scope in scopes), 2),
            0.0,
        )
        realized_amount = min(actual_amount, plan_amount)
        overrun_amount = calculate_scoped_overrun(
            [
                (float(scope.revised_plan or 0.0), float(scope.actual or 0.0))
                for _, scope in scopes
            ],
            monthly_scope=monthly_overrun,
        )
        available_capacity = max(plan_amount - realized_amount, 0.0)

        negotiated_amount = min(
            max(round(negotiated_by_group.get(group_key, 0.0), 2), 0.0),
            available_capacity,
        )
        available_capacity = max(available_capacity - negotiated_amount, 0.0)

        other_saving_amount = min(unused_amount, available_capacity)
        available_capacity = max(available_capacity - other_saving_amount, 0.0)

        canceled_budget_amount = min(cancelled_amount, available_capacity)
        available_capacity = max(available_capacity - canceled_budget_amount, 0.0)

        groups.append(
            BudgetReconciliationGroup(
                budget_item_id=item_id,
                scenario_id=item_scenario_id,
                capex_opex=_normalize_capex_opex(item.map_category if item else None),
                months=sorted({month for month, _ in scopes}),
                departments={
                    value
                    for _, scope in scopes
                    for value in scope.departments
                    if value
                },
                total_plan_amount=round(plan_amount, 2),
                actual_amount=round(actual_amount, 2),
                realized_plan_inside_amount=round(realized_amount, 2),
                remaining_available_amount=round(available_capacity, 2),
                negotiated_saving_amount=round(negotiated_amount, 2),
                other_saving_amount=round(other_saving_amount, 2),
                canceled_budget_amount=round(canceled_budget_amount, 2),
                overrun_amount=round(overrun_amount, 2),
            )
        )
    return groups


def _compute_budget_outside_total(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> float:
    months = sorted({month for month in month_range if 1 <= month <= 12})
    if not months:
        return 0.0
    capex_filter = _normalize_capex_opex(capex_opex)

    allocation_query = (
        select(func.sum(ExpenseAllocation.allocated_amount))
        .select_from(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(ExpenseAllocation.year == year)
        .where(ExpenseAllocation.month.in_(months))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(True))
    )
    if scenario_id is not None:
        allocation_query = allocation_query.where(
            ExpenseAllocation.scenario_id == scenario_id
        )
    if budget_item_id is not None:
        allocation_query = allocation_query.where(
            ExpenseAllocation.budget_item_id == budget_item_id
        )
    if department is not None:
        department_budget_items_query = (
            select(PlanEntry.budget_item_id)
            .where(PlanEntry.year == year)
            .where(PlanEntry.month.in_(months))
            .where(PlanEntry.department == department)
        )
        if scenario_id is not None:
            department_budget_items_query = department_budget_items_query.where(
                PlanEntry.scenario_id == scenario_id
            )
        allocation_query = allocation_query.where(
            ExpenseAllocation.budget_item_id.in_(department_budget_items_query)
        )
    if capex_filter:
        allocation_query = allocation_query.join(
            BudgetItem, BudgetItem.id == ExpenseAllocation.budget_item_id
        ).where(_capex_opex_column() == capex_filter)

    allocation_exists = exists().where(ExpenseAllocation.expense_id == Expense.id)
    direct_query = (
        select(func.sum(Expense.amount))
        .where(func.extract("year", Expense.expense_date) == year)
        .where(func.extract("month", Expense.expense_date).in_(months))
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(True))
        .where(~allocation_exists)
    )
    if scenario_id is not None:
        direct_query = direct_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        direct_query = direct_query.where(Expense.budget_item_id == budget_item_id)
    if department is not None:
        department_budget_items_query = (
            select(PlanEntry.budget_item_id)
            .where(PlanEntry.year == year)
            .where(PlanEntry.month.in_(months))
            .where(PlanEntry.department == department)
        )
        if scenario_id is not None:
            department_budget_items_query = department_budget_items_query.where(
                PlanEntry.scenario_id == scenario_id
            )
        direct_query = direct_query.where(
            or_(
                Expense.budget_item_id.in_(department_budget_items_query),
                Expense.budget_outside_department == department,
            )
        )
    if capex_filter:
        direct_query = direct_query.outerjoin(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(
            or_(
                _capex_opex_column() == capex_filter,
                func.lower(func.trim(Expense.budget_outside_capex_opex)) == capex_filter,
            )
        )

    allocation_total = float(session.exec(allocation_query).first() or 0.0)
    direct_total = float(session.exec(direct_query).first() or 0.0)
    return allocation_total + direct_total


def compute_budget_reconciliation_summary(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
    monthly_overrun: bool = False,
) -> BudgetReconciliationSummary:
    """Build the dashboard reconciliation from selected-scope totals.

    Overrun is computed after grouping all selected months for a budget item, so
    a single-month overrun can still be absorbed by remaining budget in the
    selected period or quarter.
    """
    groups = _compute_budget_reconciliation_groups(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
        monthly_overrun=monthly_overrun,
    )
    total_plan = sum(group.total_plan_amount for group in groups)
    realized_plan_inside = sum(group.realized_plan_inside_amount for group in groups)
    remaining_available = sum(group.remaining_available_amount for group in groups)
    negotiated_saving = sum(group.negotiated_saving_amount for group in groups)
    other_saving = sum(group.other_saving_amount for group in groups)
    canceled_budget = sum(group.canceled_budget_amount for group in groups)
    overrun = sum(group.overrun_amount for group in groups)
    capex_groups = [group for group in groups if group.capex_opex == "capex"]
    opex_groups = [group for group in groups if group.capex_opex == "opex"]
    unclassified_groups = [
        group for group in groups if group.capex_opex not in {"capex", "opex"}
    ]

    def sum_groups(
        selected_groups: list[BudgetReconciliationGroup],
        attr: str,
    ) -> float:
        return sum(float(getattr(group, attr) or 0.0) for group in selected_groups)

    capex_total_plan = sum_groups(capex_groups, "total_plan_amount")
    opex_total_plan = sum_groups(opex_groups, "total_plan_amount")
    unclassified_total_plan = sum_groups(
        unclassified_groups, "total_plan_amount"
    )
    capex_realized_plan_inside = sum_groups(
        capex_groups, "realized_plan_inside_amount"
    )
    opex_realized_plan_inside = sum_groups(
        opex_groups, "realized_plan_inside_amount"
    )
    unclassified_realized_plan_inside = sum_groups(
        unclassified_groups, "realized_plan_inside_amount"
    )
    capex_remaining_available = sum_groups(capex_groups, "remaining_available_amount")
    opex_remaining_available = sum_groups(opex_groups, "remaining_available_amount")
    unclassified_remaining_available = sum_groups(
        unclassified_groups, "remaining_available_amount"
    )
    capex_negotiated_saving = sum_groups(capex_groups, "negotiated_saving_amount")
    opex_negotiated_saving = sum_groups(opex_groups, "negotiated_saving_amount")
    unclassified_negotiated_saving = sum_groups(
        unclassified_groups, "negotiated_saving_amount"
    )
    capex_other_saving = sum_groups(capex_groups, "other_saving_amount")
    opex_other_saving = sum_groups(opex_groups, "other_saving_amount")
    unclassified_other_saving = sum_groups(
        unclassified_groups, "other_saving_amount"
    )
    capex_canceled_budget = sum_groups(capex_groups, "canceled_budget_amount")
    opex_canceled_budget = sum_groups(opex_groups, "canceled_budget_amount")
    unclassified_canceled_budget = sum_groups(
        unclassified_groups, "canceled_budget_amount"
    )
    capex_overrun = sum_groups(capex_groups, "overrun_amount")
    opex_overrun = sum_groups(opex_groups, "overrun_amount")
    unclassified_overrun = sum_groups(unclassified_groups, "overrun_amount")
    active_capex_filter = _normalize_capex_opex(capex_opex)
    budget_outside = _compute_budget_outside_total(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
    )
    capex_budget_outside = (
        0.0
        if active_capex_filter == "opex"
        else _compute_budget_outside_total(
            session,
            year=year,
            month_range=month_range,
            scenario_id=scenario_id,
            budget_item_id=budget_item_id,
            department=department,
            capex_opex="capex",
        )
    )
    opex_budget_outside = (
        0.0
        if active_capex_filter == "capex"
        else _compute_budget_outside_total(
            session,
            year=year,
            month_range=month_range,
            scenario_id=scenario_id,
            budget_item_id=budget_item_id,
            department=department,
            capex_opex="opex",
        )
    )
    unclassified_budget_outside = (
        0.0
        if active_capex_filter
        else max(budget_outside - capex_budget_outside - opex_budget_outside, 0.0)
    )
    reconciliation_total = (
        realized_plan_inside
        + remaining_available
        + negotiated_saving
        + other_saving
        + canceled_budget
    )
    capex_reconciliation_total = (
        capex_realized_plan_inside
        + capex_remaining_available
        + capex_negotiated_saving
        + capex_other_saving
        + capex_canceled_budget
    )
    opex_reconciliation_total = (
        opex_realized_plan_inside
        + opex_remaining_available
        + opex_negotiated_saving
        + opex_other_saving
        + opex_canceled_budget
    )
    unclassified_reconciliation_total = (
        unclassified_realized_plan_inside
        + unclassified_remaining_available
        + unclassified_negotiated_saving
        + unclassified_other_saving
        + unclassified_canceled_budget
    )

    return BudgetReconciliationSummary(
        total_plan_amount=round(total_plan, 2),
        capex_total_plan_amount=round(capex_total_plan, 2),
        opex_total_plan_amount=round(opex_total_plan, 2),
        unclassified_total_plan_amount=round(unclassified_total_plan, 2),
        realized_plan_inside_amount=round(realized_plan_inside, 2),
        capex_realized_plan_inside_amount=round(capex_realized_plan_inside, 2),
        opex_realized_plan_inside_amount=round(opex_realized_plan_inside, 2),
        unclassified_realized_plan_inside_amount=round(
            unclassified_realized_plan_inside, 2
        ),
        remaining_available_amount=round(remaining_available, 2),
        capex_remaining_available_amount=round(capex_remaining_available, 2),
        opex_remaining_available_amount=round(opex_remaining_available, 2),
        unclassified_remaining_available_amount=round(
            unclassified_remaining_available, 2
        ),
        negotiated_saving_amount=round(negotiated_saving, 2),
        capex_negotiated_saving_amount=round(capex_negotiated_saving, 2),
        opex_negotiated_saving_amount=round(opex_negotiated_saving, 2),
        unclassified_negotiated_saving_amount=round(
            unclassified_negotiated_saving, 2
        ),
        other_saving_amount=round(other_saving, 2),
        capex_other_saving_amount=round(capex_other_saving, 2),
        opex_other_saving_amount=round(opex_other_saving, 2),
        unclassified_other_saving_amount=round(unclassified_other_saving, 2),
        canceled_budget_amount=round(canceled_budget, 2),
        capex_canceled_budget_amount=round(capex_canceled_budget, 2),
        opex_canceled_budget_amount=round(opex_canceled_budget, 2),
        unclassified_canceled_budget_amount=round(
            unclassified_canceled_budget, 2
        ),
        overrun_amount=round(overrun, 2),
        capex_overrun_amount=round(capex_overrun, 2),
        opex_overrun_amount=round(opex_overrun, 2),
        unclassified_overrun_amount=round(unclassified_overrun, 2),
        budget_outside_amount=round(budget_outside, 2),
        capex_budget_outside_amount=round(capex_budget_outside, 2),
        opex_budget_outside_amount=round(opex_budget_outside, 2),
        unclassified_budget_outside_amount=round(unclassified_budget_outside, 2),
        reconciliation_total=round(reconciliation_total, 2),
        capex_reconciliation_total=round(capex_reconciliation_total, 2),
        opex_reconciliation_total=round(opex_reconciliation_total, 2),
        unclassified_reconciliation_total=round(
            unclassified_reconciliation_total, 2
        ),
        reconciliation_difference=round(total_plan - reconciliation_total, 2),
        capex_reconciliation_difference=round(
            capex_total_plan - capex_reconciliation_total, 2
        ),
        opex_reconciliation_difference=round(
            opex_total_plan - opex_reconciliation_total, 2
        ),
        unclassified_reconciliation_difference=round(
            unclassified_total_plan - unclassified_reconciliation_total, 2
        ),
    )


def compute_remaining_budget_statuses(
    session: Session,
    *,
    year: int,
    month_range: list[int],
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> list[BudgetItemStatus]:
    groups = _compute_budget_reconciliation_groups(
        session,
        year=year,
        month_range=month_range,
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
    )
    item_ids = {group.budget_item_id for group in groups}
    item_map = {
        item.id: item
        for item in session.exec(
            select(BudgetItem).where(BudgetItem.id.in_(item_ids or {0}))
        ).all()
    }

    statuses: list[BudgetItemStatus] = []
    for group in groups:
        if group.remaining_available_amount <= 0.005:
            continue
        item = item_map.get(group.budget_item_id)
        statuses.append(
            BudgetItemStatus(
                budget_item_id=group.budget_item_id,
                budget_code=item.code if item else "",
                budget_name=item.name if item else "",
                scenario_id=group.scenario_id,
                months=group.months,
                capex_opex=_format_capex_opex(item.map_category if item else None),
                asset_type=item.map_attribute if item else None,
                department=", ".join(sorted(group.departments)) or None,
                revised_plan=group.total_plan_amount,
                actual=group.actual_amount,
                overall_revised_plan=group.total_plan_amount,
                overall_actual=group.actual_amount,
                unused_amount=group.other_saving_amount,
                overall_unused_amount=group.other_saving_amount,
                available_amount=group.remaining_available_amount,
                overall_available_amount=group.remaining_available_amount,
                difference=group.remaining_available_amount,
                category="remaining",
            )
        )
    return statuses


def compute_monthly_summary(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    month: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> list[MonthlyAggregate]:
    plan_query = select(PlanEntry.month, func.sum(PlanEntry.amount)).where(PlanEntry.year == year)
    if capex_opex in {"capex", "opex"}:
        plan_query = plan_query.join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id).where(
            _capex_opex_column() == _normalize_capex_opex(capex_opex)
        )
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        plan_query = plan_query.where(PlanEntry.budget_item_id == budget_item_id)
    if department is not None:
        plan_query = plan_query.where(PlanEntry.department == department)
    if month is not None:
        plan_query = plan_query.where(PlanEntry.month == month)
    plan_query = plan_query.group_by(PlanEntry.month)
    plan_rows = session.exec(plan_query).all()
    plan_map = defaultdict(float, {month: amount or 0.0 for month, amount in plan_rows})

    unused_query = select(PlanEntry.month, func.sum(PlanEntry.unused_amount)).where(PlanEntry.year == year)
    if capex_opex in {"capex", "opex"}:
        unused_query = unused_query.join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id).where(
            _capex_opex_column() == _normalize_capex_opex(capex_opex)
        )
    if scenario_id is not None:
        unused_query = unused_query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        unused_query = unused_query.where(PlanEntry.budget_item_id == budget_item_id)
    if department is not None:
        unused_query = unused_query.where(PlanEntry.department == department)
    if month is not None:
        unused_query = unused_query.where(PlanEntry.month == month)
    unused_rows = session.exec(unused_query.group_by(PlanEntry.month)).all()
    unused_map = defaultdict(float, {month: amount or 0.0 for month, amount in unused_rows})

    transfer_query = select(BudgetTransfer).where(BudgetTransfer.is_cancelled.is_(False))
    if scenario_id is not None:
        transfer_query = transfer_query.where(
            (BudgetTransfer.source_scenario_id == scenario_id)
            | (BudgetTransfer.target_scenario_id == scenario_id)
        )
    transfers = session.exec(transfer_query).all()
    transfer_budget_ids = {
        transfer.source_budget_item_id
        for transfer in transfers
        if transfer.source_year == year
    } | {
        transfer.target_budget_item_id
        for transfer in transfers
        if transfer.target_year == year
    }
    budget_item_map: dict[int, BudgetItem] = {}
    if transfer_budget_ids:
        budget_item_map = {
            item.id: item
            for item in session.exec(select(BudgetItem).where(BudgetItem.id.in_(transfer_budget_ids))).all()
        }
    department_budget_ids: set[int] | None = None
    if department is not None:
        department_query = select(PlanEntry.budget_item_id).where(PlanEntry.year == year)
        if scenario_id is not None:
            department_query = department_query.where(PlanEntry.scenario_id == scenario_id)
        department_query = department_query.where(PlanEntry.department == department)
        department_budget_ids = set(session.exec(department_query).all())

    def include_transfer_side(item_id: int, transfer_month: int, transfer_scenario_id: int) -> bool:
        if scenario_id is not None and transfer_scenario_id != scenario_id:
            return False
        if budget_item_id is not None and item_id != budget_item_id:
            return False
        if department_budget_ids is not None and item_id not in department_budget_ids:
            return False
        if month is not None and transfer_month != month:
            return False
        if capex_opex in {"capex", "opex"}:
            item = budget_item_map.get(item_id)
            if not item or _normalize_capex_opex(item.map_category) != _normalize_capex_opex(capex_opex):
                return False
        return True

    for transfer in transfers:
        if transfer.source_year == year and include_transfer_side(
            transfer.source_budget_item_id, transfer.source_month, transfer.source_scenario_id
        ):
            plan_map[transfer.source_month] -= float(transfer.amount or 0)
        if transfer.target_year == year and include_transfer_side(
            transfer.target_budget_item_id, transfer.target_month, transfer.target_scenario_id
        ):
            plan_map[transfer.target_month] += float(transfer.amount or 0)

    allocation_query = (
        select(ExpenseAllocation.month, func.sum(ExpenseAllocation.allocated_amount))
        .select_from(ExpenseAllocation)
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(ExpenseAllocation.year == year)
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
    )
    if capex_opex in {"capex", "opex"}:
        allocation_query = allocation_query.join(
            BudgetItem, BudgetItem.id == ExpenseAllocation.budget_item_id
        ).where(_capex_opex_column() == _normalize_capex_opex(capex_opex))
    if scenario_id is not None:
        allocation_query = allocation_query.where(ExpenseAllocation.scenario_id == scenario_id)
    if budget_item_id is not None:
        allocation_query = allocation_query.where(ExpenseAllocation.budget_item_id == budget_item_id)
    if department is not None:
        department_budget_items_query = select(PlanEntry.budget_item_id).where(PlanEntry.year == year)
        if scenario_id is not None:
            department_budget_items_query = department_budget_items_query.where(PlanEntry.scenario_id == scenario_id)
        department_budget_items_query = department_budget_items_query.where(PlanEntry.department == department)
        allocation_query = allocation_query.where(
            ExpenseAllocation.budget_item_id.in_(department_budget_items_query)
        )
    if month is not None:
        allocation_query = allocation_query.where(ExpenseAllocation.month == month)
    allocation_rows = session.exec(allocation_query.group_by(ExpenseAllocation.month)).all()

    allocation_exists = exists().where(ExpenseAllocation.expense_id == Expense.id)
    expense_query = (
        select(func.extract("month", Expense.expense_date), func.sum(Expense.amount))
        .where(func.extract("year", Expense.expense_date) == year)
        .where(Expense.status == ExpenseStatus.RECORDED)
        .where(Expense.is_out_of_budget.is_(False))
        .where(~allocation_exists)
    )
    if capex_opex in {"capex", "opex"}:
        expense_query = expense_query.join(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(_capex_opex_column() == _normalize_capex_opex(capex_opex))
    if scenario_id is not None:
        expense_query = expense_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        expense_query = expense_query.where(Expense.budget_item_id == budget_item_id)
    if department is not None:
        department_budget_items_query = select(PlanEntry.budget_item_id).where(PlanEntry.year == year)
        if scenario_id is not None:
            department_budget_items_query = department_budget_items_query.where(PlanEntry.scenario_id == scenario_id)
        department_budget_items_query = department_budget_items_query.where(PlanEntry.department == department)
        expense_query = expense_query.where(Expense.budget_item_id.in_(department_budget_items_query))
    if month is not None:
        expense_query = expense_query.where(func.extract("month", Expense.expense_date) == month)
    expense_query = expense_query.group_by(func.extract("month", Expense.expense_date))
    expense_rows = session.exec(expense_query).all()

    expense_map = defaultdict(float, {int(month): amount or 0.0 for month, amount in expense_rows})
    for month_value, amount in allocation_rows:
        expense_map[int(month_value)] += float(amount or 0.0)

    cancelled_query = (
        select(func.extract("month", Expense.expense_date), func.sum(Expense.amount))
        .where(func.extract("year", Expense.expense_date) == year)
        .where(Expense.status == ExpenseStatus.CANCELLED)
    )
    if capex_opex in {"capex", "opex"}:
        cancelled_query = cancelled_query.join(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(_capex_opex_column() == _normalize_capex_opex(capex_opex))
    if scenario_id is not None:
        cancelled_query = cancelled_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        cancelled_query = cancelled_query.where(Expense.budget_item_id == budget_item_id)
    if department is not None:
        department_budget_items_query = select(PlanEntry.budget_item_id).where(PlanEntry.year == year)
        if scenario_id is not None:
            department_budget_items_query = department_budget_items_query.where(PlanEntry.scenario_id == scenario_id)
        department_budget_items_query = department_budget_items_query.where(PlanEntry.department == department)
        cancelled_query = cancelled_query.where(Expense.budget_item_id.in_(department_budget_items_query))
    if month is not None:
        cancelled_query = cancelled_query.where(func.extract("month", Expense.expense_date) == month)
    cancelled_rows = session.exec(
        cancelled_query.group_by(func.extract("month", Expense.expense_date))
    ).all()
    cancelled_map = defaultdict(float, {int(month): amount or 0.0 for month, amount in cancelled_rows})
    cancelled_budget_rows = session.exec(
        cancelled_query.where(Expense.is_out_of_budget.is_(False)).group_by(
            func.extract("month", Expense.expense_date)
        )
    ).all()
    cancelled_budget_map = defaultdict(
        float,
        {int(month): amount or 0.0 for month, amount in cancelled_budget_rows},
    )

    months = (
        {month}
        if month is not None
        else set(plan_map.keys())
        | set(expense_map.keys())
        | set(unused_map.keys())
        | set(cancelled_map.keys())
        | set(range(1, 13))
    )
    saving_map: dict[int, float] = defaultdict(float)
    for item in compute_negotiated_saving_statuses(
        session,
        year=year,
        month_range=sorted(months),
        scenario_id=scenario_id,
        budget_item_id=budget_item_id,
        department=department,
        capex_opex=capex_opex,
    ):
        for saving_month in item.months:
            saving_map[saving_month] += float(item.difference or 0)

    return [
        MonthlyAggregate(
            month=m,
            planned=float(plan_map[m]),
            actual=float(expense_map[m]),
            unused=float(unused_map[m]),
            negotiated_saving=float(saving_map[m]),
            cancelled=float(cancelled_map[m]),
            cancelled_budget=float(cancelled_budget_map[m]),
        )
        for m in sorted(months)
    ]


def totalize(monthly: Iterable[MonthlyAggregate]) -> tuple[float, float]:
    total_plan = sum(item.planned for item in monthly)
    total_actual = sum(item.actual for item in monthly)
    return total_plan, total_actual


def compute_quarterly_summary(
    session: Session,
    year: int,
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> list[QuarterlyAggregate]:
    monthly = compute_monthly_summary(
        session, year, scenario_id, budget_item_id, None, department, capex_opex
    )
    planned_map = defaultdict(float, {item.month: item.planned for item in monthly})
    actual_map = defaultdict(float, {item.month: item.actual for item in monthly})
    unused_map = defaultdict(float, {item.month: item.unused for item in monthly})
    saving_map = defaultdict(float, {item.month: item.saving for item in monthly})

    out_of_budget_query = (
        select(func.extract("month", Expense.expense_date), func.sum(Expense.amount))
        .where(func.extract("year", Expense.expense_date) == year)
        .where(Expense.is_out_of_budget.is_(True))
        .where(Expense.status == ExpenseStatus.RECORDED)
    )
    if capex_opex in {"capex", "opex"}:
        normalized_capex_opex = _normalize_capex_opex(capex_opex)
        out_of_budget_query = out_of_budget_query.outerjoin(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(
            or_(
                _capex_opex_column() == normalized_capex_opex,
                func.lower(func.trim(Expense.budget_outside_capex_opex)) == normalized_capex_opex,
            )
        )
    if scenario_id is not None:
        out_of_budget_query = out_of_budget_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        out_of_budget_query = out_of_budget_query.where(Expense.budget_item_id == budget_item_id)
    if department is not None:
        department_budget_items_query = select(PlanEntry.budget_item_id).where(PlanEntry.year == year)
        if scenario_id is not None:
            department_budget_items_query = department_budget_items_query.where(PlanEntry.scenario_id == scenario_id)
        department_budget_items_query = department_budget_items_query.where(PlanEntry.department == department)
        out_of_budget_query = out_of_budget_query.where(
            or_(
                Expense.budget_item_id.in_(department_budget_items_query),
                Expense.budget_outside_department == department,
            )
        )
    out_of_budget_rows = session.exec(out_of_budget_query.group_by(func.extract("month", Expense.expense_date))).all()
    out_of_budget_map = defaultdict(
        float, {int(month): float(amount or 0.0) for month, amount in out_of_budget_rows}
    )

    cancelled_query = (
        select(func.extract("month", Expense.expense_date), func.sum(Expense.amount))
        .where(func.extract("year", Expense.expense_date) == year)
        .where(Expense.status == ExpenseStatus.CANCELLED)
    )
    if capex_opex in {"capex", "opex"}:
        cancelled_query = cancelled_query.join(
            BudgetItem, BudgetItem.id == Expense.budget_item_id
        ).where(_capex_opex_column() == _normalize_capex_opex(capex_opex))
    if scenario_id is not None:
        cancelled_query = cancelled_query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        cancelled_query = cancelled_query.where(Expense.budget_item_id == budget_item_id)
    if department is not None:
        department_budget_items_query = select(PlanEntry.budget_item_id).where(PlanEntry.year == year)
        if scenario_id is not None:
            department_budget_items_query = department_budget_items_query.where(PlanEntry.scenario_id == scenario_id)
        department_budget_items_query = department_budget_items_query.where(PlanEntry.department == department)
        cancelled_query = cancelled_query.where(Expense.budget_item_id.in_(department_budget_items_query))
    cancelled_rows = session.exec(cancelled_query.group_by(func.extract("month", Expense.expense_date))).all()
    cancelled_map = defaultdict(float, {int(month): float(amount or 0.0) for month, amount in cancelled_rows})

    quarterly: list[QuarterlyAggregate] = []
    for quarter in range(1, 5):
        start_month = (quarter - 1) * 3 + 1
        months = range(start_month, start_month + 3)
        planned_total = sum(float(planned_map[m]) for m in months)
        actual_total = sum(float(actual_map[m]) for m in months)
        unused_total = sum(float(unused_map[m]) for m in months)
        negotiated_saving_total = sum(float(saving_map[m]) for m in months)
        out_of_budget_total = sum(float(out_of_budget_map[m]) for m in months)
        cancelled_total = sum(float(cancelled_map[m]) for m in months)
        quarterly.append(
            QuarterlyAggregate(
                quarter=quarter,
                planned=planned_total,
                actual=actual_total,
                unused=unused_total,
                out_of_budget=out_of_budget_total,
                cancelled=cancelled_total,
                negotiated_saving=negotiated_saving_total,
            )
        )
    return quarterly
