from unittest import TestCase

from types import SimpleNamespace

from app.routers.expenses import (
    _filter_pending_budget_actions,
    _include_pending_expense,
    _is_pending_budget_action,
    _pending_budget_action_counts,
    _pending_expense_reason,
    _pending_step_for,
)


class PendingInvoiceMissingTests(TestCase):
    def test_no_expense_means_expense_and_invoice_are_both_missing(self) -> None:
        reason, _, missing = _pending_expense_reason([])
        self.assertEqual(reason, "expense_missing")
        self.assertIsNone(missing)

        item = SimpleNamespace(pending_step="expense_pending")
        counts = _pending_budget_action_counts([item])
        self.assertEqual(counts.expense_pending, 1)
        self.assertEqual(counts.invoice_pending, 0)
        self.assertEqual(_pending_step_for(reason, requested=True), ("expense_pending", "Harcama Bekliyor"))

    def test_missing_request_has_priority_over_other_missing_actions(self) -> None:
        self.assertEqual(
            _pending_step_for("expense_missing", requested=False),
            ("request_pending", "Talep Bekliyor"),
        )
        self.assertEqual(
            _pending_step_for("invoice_missing", requested=False),
            ("request_pending", "Talep Bekliyor"),
        )

    def test_active_expense_without_invoice_is_missing(self) -> None:
        reason, _, missing = _pending_expense_reason([(10, 3_066.00, 0)])
        self.assertEqual(reason, "invoice_missing")
        self.assertEqual(missing[0], 10)

    def test_active_expense_with_invoice_is_complete(self) -> None:
        reason, _, missing = _pending_expense_reason([(10, 3_066.00, 1)])
        self.assertEqual(reason, "")
        self.assertIsNone(missing)

    def test_any_missing_invoice_marks_plan_scope(self) -> None:
        reason, _, missing = _pending_expense_reason(
            [(10, 1_000.00, 1), (11, 2_000.00, 0), (12, 500.00, 1)]
        )
        self.assertEqual(reason, "invoice_missing")
        self.assertEqual(missing[0], 11)

    def test_cctv_over_budget_expense_is_still_invoice_missing(self) -> None:
        # Budget/remaining is deliberately absent: invoice completeness is expense-based.
        reason, _, missing = _pending_expense_reason([(4150, 3_066.00, 0)])
        self.assertEqual(reason, "invoice_missing")
        self.assertEqual(missing[1], 3_066.00)
        self.assertTrue(_include_pending_expense(reason, 0))

    def test_invoice_card_counts_plan_once(self) -> None:
        item = SimpleNamespace(pending_step="invoice_pending")
        counts = _pending_budget_action_counts([item])
        self.assertEqual(counts.invoice_pending, 1)
        self.assertEqual(counts.all, 1)

    def test_invoice_only_item_is_not_counted_as_expense_pending(self) -> None:
        item = SimpleNamespace(pending_step="invoice_pending")
        counts = _pending_budget_action_counts([item])
        self.assertEqual(counts.expense_pending, 0)
        self.assertEqual(counts.invoice_pending, 1)

    def test_completed_requested_item_is_not_pending_or_counted(self) -> None:
        item = SimpleNamespace(pending_step="")
        self.assertFalse(_is_pending_budget_action(item))
        counts = _pending_budget_action_counts([item])
        self.assertEqual(counts.all, 0)
        self.assertEqual(counts.request_pending, 0)

    def test_socradar_completed_with_remaining_saving_is_not_reopened(self) -> None:
        # Regression: "SOCRadar - $20K Ocak ödeme 12 ay geçerli" keeps its
        # request history and saving, but has no missing operational action.
        reason, _, _ = _pending_expense_reason([(10, 20_000.00, 1)])
        self.assertEqual(reason, "")
        self.assertFalse(_include_pending_expense(reason, 5_000.00))

    def test_reverted_completed_item_returns_to_request_pending(self) -> None:
        reason, _, _ = _pending_expense_reason([(10, 20_000.00, 1)])
        self.assertTrue(_include_pending_expense(reason, 0, requested=False))
        self.assertEqual(
            _pending_step_for(reason, requested=False),
            ("request_pending", "Talep Bekliyor"),
        )

    def test_each_item_is_counted_once_and_status_sum_equals_all(self) -> None:
        items = [
            SimpleNamespace(pending_step="request_pending"),
            SimpleNamespace(pending_step="expense_pending"),
            SimpleNamespace(pending_step="invoice_pending"),
        ]
        counts = _pending_budget_action_counts(items)
        self.assertEqual(counts.all, 3)
        self.assertEqual(
            counts.request_pending + counts.expense_pending + counts.invoice_pending,
            counts.all,
        )
        self.assertEqual(len(_filter_pending_budget_actions(items, "all")), counts.all)
        self.assertEqual(
            len(_filter_pending_budget_actions(items, "request")),
            counts.request_pending,
        )
        self.assertEqual(
            len(_filter_pending_budget_actions(items, "expense")),
            counts.expense_pending,
        )
        self.assertEqual(
            len(_filter_pending_budget_actions(items, "invoice")),
            counts.invoice_pending,
        )

    def test_unused_item_with_no_available_amount_keeps_existing_exclusion(self) -> None:
        reason, _, _ = _pending_expense_reason([])
        self.assertFalse(_include_pending_expense(reason, 0))
