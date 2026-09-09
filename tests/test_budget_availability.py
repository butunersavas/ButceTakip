from unittest import TestCase

from app.services.budget_availability import calculate_budget_availability


class BudgetAvailabilityTests(TestCase):
    def test_month_remaining(self) -> None:
        result = calculate_budget_availability(10_000, 3_000, 0)
        self.assertEqual(result.available_amount, 7_000)

    def test_partial_unused_remains_active(self) -> None:
        result = calculate_budget_availability(10_000, 3_000, 4_000)
        self.assertEqual(result.available_amount, 3_000)

    def test_full_remaining_unused_closes_balance(self) -> None:
        result = calculate_budget_availability(10_000, 3_000, 7_000)
        self.assertEqual(result.available_amount, 0)

    def test_legacy_null_values_do_not_zero_plan(self) -> None:
        result = calculate_budget_availability(10_000, None, None)
        self.assertEqual(result.available_amount, 10_000)

    def test_overallocated_balance_is_clamped(self) -> None:
        result = calculate_budget_availability(10_000, 8_000, 4_000)
        self.assertEqual(result.available_amount, 0)
