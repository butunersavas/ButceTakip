from types import SimpleNamespace
from unittest import TestCase

from openpyxl import Workbook

from app.services.exporter import EXPORT_HEADERS, _append_plan_rows
from app.services.unused_reason import UNUSED_REASON_LABELS, unused_reason_label


class UnusedReasonExportTests(TestCase):
    def test_final_labels_are_standardized(self) -> None:
        self.assertEqual(
            UNUSED_REASON_LABELS,
            {
                "purchase_cancelled": "Alımdan Vazgeçildi.",
                "no_longer_needed": "İhtiyaç Kalmadı.",
                "other_budget": "Başka Bütçeden Karşılandı.",
                "unused": "Kullanılmayacak.",
            },
        )

    def test_plan_export_uses_label_and_separate_note_column(self) -> None:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(EXPORT_HEADERS)
        plan = SimpleNamespace(
            budget_item_id=1, scenario_id=1, year=2026, month=8, amount=10_000,
            department="BT", unused_reason="other_budget", unused_note="2027 bütçesine taşındı.",
        )
        budget_item = SimpleNamespace(code="BT-1", name="Network", map_category="capex", map_attribute="altyapı")
        scenario = SimpleNamespace(name="Temel")

        _append_plan_rows(sheet, [plan], {1: budget_item}, {1: scenario})

        exported = dict(zip(EXPORT_HEADERS, [cell.value for cell in sheet[2]]))
        self.assertEqual(exported["Kullanılmayacak Sebebi"], "Başka Bütçeden Karşılandı.")
        self.assertEqual(exported["Not"], "2027 bütçesine taşındı.")
        self.assertNotIn("other_budget", exported.values())
        self.assertEqual(unused_reason_label("other_budget"), "Başka Bütçeden Karşılandı.")
