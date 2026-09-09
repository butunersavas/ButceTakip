from dataclasses import dataclass


@dataclass(frozen=True)
class BudgetAvailability:
    planned_amount: float
    valid_expense_total: float
    unused_amount: float
    available_amount: float


def calculate_budget_availability(
    planned_amount: float | int | None,
    valid_expense_total: float | int | None,
    unused_amount: float | int | None,
) -> BudgetAvailability:
    """Return the shared spendable balance; cancelled expenses are not valid spend."""

    planned = round(float(planned_amount or 0), 2)
    actual = round(float(valid_expense_total or 0), 2)
    unused = round(float(unused_amount or 0), 2)
    available = round(max(planned - actual - unused, 0.0), 2)
    return BudgetAvailability(planned, actual, unused, available)
