from unittest import TestCase

from pydantic import ValidationError

from app.schemas import PlanEntryUpdate, PlanUnusedApply


class UnusedReasonValidationTests(TestCase):
    def test_reason_is_required(self) -> None:
        with self.assertRaises(ValidationError):
            PlanUnusedApply(mode="current_month")

    def test_only_known_reasons_are_accepted(self) -> None:
        with self.assertRaises(ValidationError):
            PlanUnusedApply(mode="current_month", reason="invalid")

    def test_turkish_label_is_normalized_to_internal_value(self) -> None:
        payload = PlanUnusedApply(mode="current_month", reason="İhtiyaç kalmadı")
        self.assertEqual(payload.reason, "no_longer_needed")

    def test_plan_update_normalizes_known_reason(self) -> None:
        payload = PlanEntryUpdate(unused_reason="Başka Bütçe")
        self.assertEqual(payload.unused_reason, "other_budget")

    def test_plan_update_rejects_unknown_reason(self) -> None:
        with self.assertRaises(ValidationError):
            PlanEntryUpdate(unused_reason="Geçersiz")

    def test_unused_note_is_limited_to_500_characters(self) -> None:
        with self.assertRaises(ValidationError):
            PlanEntryUpdate(unused_note="x" * 501)
