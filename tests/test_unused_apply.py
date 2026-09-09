from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

from fastapi import HTTPException

from app.routers.plans import apply_plan_unused_budget
from app.schemas import PlanUnusedApply


def row(row_id: int, year: int, month: int, unused: float = 0):
    return SimpleNamespace(
        id=row_id,
        year=year,
        month=month,
        unused_amount=unused,
        unused_reason=None,
        unused_note=None,
        unused_updated_at=None,
        updated_at=None,
    )


def summary(available: float):
    return SimpleNamespace(
        revised_amount=10_000,
        actual_amount=10_000 - available,
        unused_amount=0,
        available_amount=available,
    )


class UnusedApplyTests(TestCase):
    def test_current_month_applies_only_current_balance(self) -> None:
        plan = row(1, 2026, 8)
        future = row(2, 2026, 9)
        session = Mock()
        session.get.return_value = plan
        with patch(
            "app.routers.plans._remaining_plan_scopes",
            return_value=[(plan, summary(7_000)), (future, summary(5_000))],
        ):
            result = apply_plan_unused_budget(
                plan.id, PlanUnusedApply(mode="current_month", reason="no_longer_needed"), session, Mock()
            )
        self.assertEqual(plan.unused_amount, 7_000)
        self.assertEqual(future.unused_amount, 0)
        self.assertEqual(result["applied_amount"], 7_000)
        session.commit.assert_called_once_with()

    def test_all_remaining_applies_current_and_future_balances(self) -> None:
        plan = row(1, 2026, 8, unused=1_000)
        future = row(2, 2026, 9)
        session = Mock()
        session.get.return_value = plan
        with patch(
            "app.routers.plans._remaining_plan_scopes",
            return_value=[(plan, summary(7_000)), (future, summary(5_000))],
        ):
            result = apply_plan_unused_budget(
                plan.id, PlanUnusedApply(mode="all_remaining", reason="other_budget"), session, Mock()
            )
        self.assertEqual(plan.unused_amount, 8_000)
        self.assertEqual(future.unused_amount, 5_000)
        self.assertEqual(result["applied_amount"], 12_000)

    def test_custom_amount_over_month_balance_is_rejected(self) -> None:
        plan = row(1, 2026, 8)
        session = Mock()
        session.get.return_value = plan
        with patch(
            "app.routers.plans._remaining_plan_scopes",
            return_value=[(plan, summary(7_000))],
        ), self.assertRaises(HTTPException) as raised:
            apply_plan_unused_budget(
                plan.id,
                PlanUnusedApply(mode="custom", amount=8_000, reason="unused"),
                session,
                Mock(),
            )
        self.assertEqual(raised.exception.status_code, 400)
        session.commit.assert_not_called()

    def test_reason_only_does_not_change_unused_amount(self) -> None:
        plan = row(1, 2026, 8, unused=6_000)
        session = Mock()
        session.get.return_value = plan
        result = apply_plan_unused_budget(
            plan.id,
            PlanUnusedApply(mode="reason_only", reason="purchase_cancelled", note="Satın alma iptal edildi."),
            session,
            Mock(),
        )
        self.assertEqual(plan.unused_amount, 6_000)
        self.assertEqual(plan.unused_reason, "purchase_cancelled")
        self.assertEqual(plan.unused_note, "Satın alma iptal edildi.")
        self.assertEqual(result["applied_amount"], 0)
        session.commit.assert_called_once_with()
