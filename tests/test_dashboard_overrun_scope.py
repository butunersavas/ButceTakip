from unittest import TestCase

from app.services.analytics import calculate_scoped_overrun


class DashboardOverrunScopeTests(TestCase):
    def test_general_view_uses_budget_item_total(self) -> None:
        months = [(18_000, 32_000), (57_000, 16_125)]
        self.assertEqual(calculate_scoped_overrun(months, monthly_scope=False), 0)

    def test_budget_item_detail_sums_positive_months(self) -> None:
        months = [(18_000, 32_000), (57_000, 16_125)]
        self.assertEqual(calculate_scoped_overrun(months, monthly_scope=True), 14_000)

    def test_monthly_remaining_does_not_offset_another_month(self) -> None:
        months = [(10_000, 15_000), (10_000, 2_000)]
        self.assertEqual(calculate_scoped_overrun(months, monthly_scope=True), 5_000)

    def test_multiple_monthly_overruns_are_added(self) -> None:
        months = [(10_000, 15_000), (18_000, 32_000), (8_000, 10_000)]
        self.assertEqual(calculate_scoped_overrun(months, monthly_scope=True), 21_000)

    def test_general_view_does_not_offset_between_budget_items(self) -> None:
        item_overruns = [
            calculate_scoped_overrun([(100_000, 110_000)], monthly_scope=False),
            calculate_scoped_overrun([(80_000, 70_000)], monthly_scope=False),
            calculate_scoped_overrun([(40_000, 43_000)], monthly_scope=False),
        ]
        self.assertEqual(sum(item_overruns), 13_000)
