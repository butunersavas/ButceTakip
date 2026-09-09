from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch

from fastapi import HTTPException

from app.routers.plans import update_plan_entry
from app.schemas import PlanEntryUpdate


class PlanUpdateUnusedReasonTests(TestCase):
    def test_reason_update_preserves_amounts(self) -> None:
        plan = SimpleNamespace(
            id=1,
            amount=10_000,
            unused_amount=6_000,
            unused_reason="no_longer_needed",
            unused_note="Eski not",
            updated_at=None,
        )
        session = Mock()
        session.get.return_value = plan

        with patch("app.routers.plans._fetch_plan_read", return_value=plan):
            update_plan_entry(
                plan.id,
                PlanEntryUpdate(unused_reason="other_budget", unused_note="Yeni not"),
                session,
                Mock(),
            )

        self.assertEqual(plan.amount, 10_000)
        self.assertEqual(plan.unused_amount, 6_000)
        self.assertEqual(plan.unused_reason, "other_budget")
        self.assertEqual(plan.unused_note, "Yeni not")
        session.commit.assert_called_once_with()

    def test_reason_cannot_be_set_without_unused_amount(self) -> None:
        plan = SimpleNamespace(id=1, unused_amount=0, unused_reason=None)
        session = Mock()
        session.get.return_value = plan

        with self.assertRaises(HTTPException) as raised:
            update_plan_entry(
                plan.id,
                PlanEntryUpdate(unused_reason="unused"),
                session,
                Mock(),
            )

        self.assertEqual(raised.exception.status_code, 400)
        session.commit.assert_not_called()

    def test_note_only_update_preserves_reason_and_amount(self) -> None:
        plan = SimpleNamespace(
            id=2, amount=10_000, unused_amount=6_000,
            unused_reason="other_budget", unused_note="A", updated_at=None,
        )
        session = Mock()
        session.get.return_value = plan

        with patch("app.routers.plans._fetch_plan_read", return_value=plan):
            update_plan_entry(plan.id, PlanEntryUpdate(unused_note="B"), session, Mock())

        self.assertEqual(plan.amount, 10_000)
        self.assertEqual(plan.unused_amount, 6_000)
        self.assertEqual(plan.unused_reason, "other_budget")
        self.assertEqual(plan.unused_note, "B")
