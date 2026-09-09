from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock

from fastapi import HTTPException

from app.routers.purchase_alerts import set_purchase_alert_requested
from app.schemas import PurchaseAlertSetRequest


class PurchaseAlertRevertGuardTests(TestCase):
    def _assert_revert_blocked(self, plan, expected_status: int) -> None:
        session = Mock()
        session.get.return_value = plan
        session.exec.return_value.first.return_value = None

        with self.assertRaises(HTTPException) as raised:
            set_purchase_alert_requested(
                plan.id,
                PurchaseAlertSetRequest(requested=False),
                session,
                plan,
            )

        self.assertEqual(raised.exception.status_code, expected_status)
        session.commit.assert_not_called()

    def test_viewer_cannot_revert_purchase_request(self) -> None:
        self._assert_revert_blocked(
            SimpleNamespace(
                id=1,
                unused_amount=0,
                purchase_requested=True,
                is_admin=False,
                role="viewer",
            ),
            403,
        )

    def test_unused_plan_cannot_be_reverted(self) -> None:
        self._assert_revert_blocked(
            SimpleNamespace(
                id=2,
                unused_amount=100,
                purchase_requested=True,
                is_admin=True,
                role="admin",
            ),
            409,
        )

    def test_already_pending_plan_cannot_be_reverted(self) -> None:
        self._assert_revert_blocked(
            SimpleNamespace(
                id=3,
                unused_amount=0,
                purchase_requested=False,
                budget_code="TEST-001",
                budget_item_id=None,
                department=None,
                year=2026,
                month=8,
                scenario_id=1,
                is_admin=True,
                role="admin",
            ),
            409,
        )

    def test_revert_updates_existing_purchase_fields_and_commits(self) -> None:
        plan = SimpleNamespace(
            id=4,
            unused_amount=0,
            purchase_requested=True,
            purchase_requested_at="previous-date",
            purchase_requested_by="previous-user",
            budget_code="TEST-002",
            budget_item_id=None,
            department="BT",
            year=2026,
            month=8,
            scenario_id=1,
            planned_amount=1250,
            updated_at=None,
        )
        prepared_status = SimpleNamespace(
            is_form_prepared=True,
            updated_at=None,
            updated_by=None,
        )
        user = SimpleNamespace(id=10, username="admin", is_admin=True, role="admin")
        session = Mock()
        session.get.return_value = plan
        session.exec.return_value.first.return_value = prepared_status

        result = set_purchase_alert_requested(
            plan.id,
            PurchaseAlertSetRequest(requested=False),
            session,
            user,
        )

        self.assertFalse(plan.purchase_requested)
        self.assertIsNone(plan.purchase_requested_at)
        self.assertIsNone(plan.purchase_requested_by)
        self.assertFalse(prepared_status.is_form_prepared)
        self.assertEqual(plan.planned_amount, 1250)
        self.assertEqual(result["status"], "pending")
        session.commit.assert_called_once_with()
