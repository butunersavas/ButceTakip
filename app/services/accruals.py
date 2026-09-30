from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from app.models import (
    BudgetItem,
    BudgetTransfer,
    Expense,
    ExpenseAccrualUsage,
    ExpenseAllocation,
    ExpenseStatus,
    PlanAccrual,
    PlanAccrualAllocation,
    PlanEntry,
    Scenario,
)


MONEY = Decimal("0.01")


def money(value: Decimal | float | int | str | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY, rounding=ROUND_HALF_UP)


def accrual_amounts(total_amount: Decimal, month_count: int) -> list[Decimal]:
    total_cents = int((money(total_amount) * 100).to_integral_exact())
    base_cents, remainder = divmod(total_cents, month_count)
    values = [Decimal(base_cents) / Decimal(100) for _ in range(month_count)]
    values[-1] += Decimal(remainder) / Decimal(100)
    return [money(value) for value in values]


def accrual_periods(start_year: int, start_month: int, month_count: int):
    for offset in range(month_count):
        absolute_month = start_month - 1 + offset
        yield start_year + absolute_month // 12, absolute_month % 12 + 1


def source_budget_summary(
    session: Session,
    *,
    budget_item_id: int,
    source_year: int,
    source_scenario_id: int,
    department: str | None = None,
    exclude_accrual_id: int | None = None,
) -> dict[str, Decimal]:
    plan_query = select(PlanEntry).where(
        PlanEntry.budget_item_id == budget_item_id,
        PlanEntry.year == source_year,
        PlanEntry.scenario_id == source_scenario_id,
    )
    if department is not None:
        plan_query = plan_query.where(func.coalesce(PlanEntry.department, "") == department)
    plans = session.exec(plan_query).all()
    plan_total = sum((money(row.amount) for row in plans), Decimal("0.00"))
    unused_total = sum((money(row.unused_amount) for row in plans), Decimal("0.00"))

    transfer_in = session.exec(
        select(func.coalesce(func.sum(BudgetTransfer.amount), 0)).where(
            BudgetTransfer.target_budget_item_id == budget_item_id,
            BudgetTransfer.target_year == source_year,
            BudgetTransfer.target_scenario_id == source_scenario_id,
            BudgetTransfer.is_cancelled.is_(False),
        )
    ).one()
    transfer_out = session.exec(
        select(func.coalesce(func.sum(BudgetTransfer.amount), 0)).where(
            BudgetTransfer.source_budget_item_id == budget_item_id,
            BudgetTransfer.source_year == source_year,
            BudgetTransfer.source_scenario_id == source_scenario_id,
            BudgetTransfer.is_cancelled.is_(False),
        )
    ).one()

    allocated_actual = session.exec(
        select(func.coalesce(func.sum(ExpenseAllocation.allocated_amount), 0))
        .join(Expense, Expense.id == ExpenseAllocation.expense_id)
        .where(
            ExpenseAllocation.budget_item_id == budget_item_id,
            ExpenseAllocation.year == source_year,
            ExpenseAllocation.scenario_id == source_scenario_id,
            Expense.status == ExpenseStatus.RECORDED,
            Expense.is_out_of_budget.is_(False),
            Expense.funding_source != "carryover",
        )
    ).one()
    fallback_actual = session.exec(
        select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.budget_item_id == budget_item_id,
            Expense.scenario_id == source_scenario_id,
            func.extract("year", Expense.expense_date) == source_year,
            Expense.status == ExpenseStatus.RECORDED,
            Expense.is_out_of_budget.is_(False),
            Expense.funding_source != "carryover",
            ~select(ExpenseAllocation.id)
            .where(ExpenseAllocation.expense_id == Expense.id)
            .exists(),
        )
    ).one()

    reserve_query = (
        select(func.coalesce(func.sum(
            PlanAccrualAllocation.amount - PlanAccrualAllocation.used_amount
        ), 0))
        .join(PlanAccrual, PlanAccrual.id == PlanAccrualAllocation.accrual_id)
        .where(
            PlanAccrual.budget_item_id == budget_item_id,
            PlanAccrual.source_year == source_year,
            PlanAccrual.source_scenario_id == source_scenario_id,
            PlanAccrual.status == "ACTIVE",
        )
    )
    if department is not None:
        reserve_query = reserve_query.where(
            func.coalesce(PlanAccrual.department, "") == department
        )
    if exclude_accrual_id is not None:
        reserve_query = reserve_query.where(PlanAccrual.id != exclude_accrual_id)
    reserved = money(session.exec(reserve_query).one())
    revised = money(plan_total + money(transfer_in) - money(transfer_out))
    actual = money(money(allocated_actual) + money(fallback_actual))
    available_before_reserve = max(revised - actual - unused_total, Decimal("0.00"))
    available = max(available_before_reserve - reserved, Decimal("0.00"))
    return {
        "plan": money(plan_total),
        "revised": revised,
        "actual": actual,
        "unused": money(unused_total),
        "reserved": reserved,
        "available_before_reserve": money(available_before_reserve),
        "available": money(available),
    }


def accrual_allocations_for_year(
    session: Session,
    *,
    year: int,
    budget_item_id: int | None = None,
    scenario_id: int | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
    include_source_year: bool = False,
    lock: bool = False,
) -> list[tuple[PlanAccrualAllocation, PlanAccrual, BudgetItem, Scenario]]:
    source_scenario = Scenario
    query = (
        select(PlanAccrualAllocation, PlanAccrual, BudgetItem, source_scenario)
        .join(PlanAccrual, PlanAccrual.id == PlanAccrualAllocation.accrual_id)
        .join(BudgetItem, BudgetItem.id == PlanAccrual.budget_item_id)
        .join(source_scenario, source_scenario.id == PlanAccrual.source_scenario_id)
        .where(
            PlanAccrual.status == "ACTIVE",
            PlanAccrual.source_year <= year if include_source_year else PlanAccrual.source_year < year,
            PlanAccrualAllocation.year == year,
        )
        .order_by(
            PlanAccrual.source_year,
            PlanAccrualAllocation.month,
            PlanAccrualAllocation.id,
        )
    )
    if budget_item_id is not None:
        query = query.where(PlanAccrual.budget_item_id == budget_item_id)
    if department is not None:
        query = query.where(func.coalesce(PlanAccrual.department, "") == department)
    if capex_opex in {"capex", "opex"}:
        query = query.where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)
    if scenario_id is not None:
        target_scenario = session.get(Scenario, scenario_id)
        if target_scenario:
            query = query.where(
                func.lower(func.trim(source_scenario.name))
                == target_scenario.name.strip().lower()
            )
    if lock:
        query = query.with_for_update()
    return list(session.exec(query).all())


def accrual_reservations_for_source_year(
    session: Session,
    *,
    source_year: int,
    source_months: list[int] | None = None,
    budget_item_id: int | None = None,
    scenario_ids: list[int | None] | None = None,
    department: str | None = None,
    capex_opex: str | None = None,
) -> list[tuple[PlanAccrualAllocation, PlanAccrual, BudgetItem]]:
    query = (
        select(PlanAccrualAllocation, PlanAccrual, BudgetItem)
        .join(PlanAccrual, PlanAccrual.id == PlanAccrualAllocation.accrual_id)
        .join(BudgetItem, BudgetItem.id == PlanAccrual.budget_item_id)
        .join(PlanEntry, PlanEntry.id == PlanAccrual.source_plan_id)
        .where(
            PlanAccrual.status == "ACTIVE",
            PlanAccrual.source_year == source_year,
        )
        .order_by(
            PlanAccrual.source_year,
            PlanAccrualAllocation.year,
            PlanAccrualAllocation.month,
            PlanAccrualAllocation.id,
        )
    )
    if source_months:
        query = query.where(PlanEntry.month.in_(source_months))
    if budget_item_id is not None:
        query = query.where(PlanAccrual.budget_item_id == budget_item_id)
    resolved_scenario_ids = [value for value in (scenario_ids or []) if value is not None]
    if resolved_scenario_ids:
        query = query.where(PlanAccrual.source_scenario_id.in_(resolved_scenario_ids))
    if department is not None:
        query = query.where(func.coalesce(PlanAccrual.department, "") == department)
    if capex_opex in {"capex", "opex"}:
        query = query.where(func.lower(func.trim(BudgetItem.map_category)) == capex_opex)
    return list(session.exec(query).all())


def carryover_totals(rows) -> dict[str, Decimal | int]:
    total = sum((money(row[0].amount) for row in rows), Decimal("0.00"))
    used = sum((money(row[0].used_amount) for row in rows), Decimal("0.00"))
    return {
        "total": money(total),
        "used": money(used),
        "remaining": money(max(total - used, Decimal("0.00"))),
        "item_count": len({row[1].id for row in rows}),
    }


def release_expense_accrual_usage(session: Session, expense_id: int) -> None:
    usages = session.exec(
        select(ExpenseAccrualUsage)
        .where(ExpenseAccrualUsage.expense_id == expense_id)
        .with_for_update()
    ).all()
    for usage in usages:
        allocation = session.get(PlanAccrualAllocation, usage.accrual_allocation_id)
        if allocation:
            allocation.used_amount = money(
                max(money(allocation.used_amount) - money(usage.amount), Decimal("0.00"))
            )
            session.add(allocation)
        session.delete(usage)
    session.flush()


def apply_expense_accrual_usage(
    session: Session,
    *,
    expense: Expense,
    expense_allocations: list[ExpenseAllocation],
    funding_source: str,
) -> Decimal:
    if (
        funding_source == "current"
        or expense.is_out_of_budget
        or not expense.budget_item_id
        or not expense.scenario_id
        or expense.status != ExpenseStatus.RECORDED
    ):
        return Decimal("0.00")
    rows = accrual_allocations_for_year(
        session,
        year=expense.expense_date.year,
        budget_item_id=expense.budget_item_id,
        scenario_id=expense.scenario_id,
        lock=True,
    )
    remaining_pool = sum(
        (max(money(allocation.amount) - money(allocation.used_amount), Decimal("0.00")) for allocation, *_ in rows),
        Decimal("0.00"),
    )
    requested = money(expense.amount)
    if funding_source == "carryover" and remaining_pool < requested:
        raise HTTPException(
            status_code=400,
            detail="Devreden tahakkuk bakiyesi harcama tutarını karşılamıyor.",
        )
    target = min(requested, remaining_pool)
    if target <= 0:
        return Decimal("0.00")

    allocation_cursor = 0
    expense_parts = expense_allocations or [None]
    part_remaining = {
        id(part) if part is not None else 0: money(part.allocated_amount if part else requested)
        for part in expense_parts
    }
    used_total = Decimal("0.00")
    for accrual_allocation, *_ in rows:
        available = max(
            money(accrual_allocation.amount) - money(accrual_allocation.used_amount),
            Decimal("0.00"),
        )
        while available > 0 and used_total < target and allocation_cursor < len(expense_parts):
            expense_part = expense_parts[allocation_cursor]
            key = id(expense_part) if expense_part is not None else 0
            if part_remaining[key] <= 0:
                allocation_cursor += 1
                continue
            consume = min(available, part_remaining[key], target - used_total)
            session.add(ExpenseAccrualUsage(
                expense_id=expense.id,
                expense_allocation_id=expense_part.id if expense_part is not None else None,
                accrual_allocation_id=accrual_allocation.id,
                amount=money(consume),
            ))
            accrual_allocation.used_amount = money(accrual_allocation.used_amount) + money(consume)
            session.add(accrual_allocation)
            available -= consume
            part_remaining[key] -= consume
            used_total += consume
    session.flush()
    return money(used_total)
