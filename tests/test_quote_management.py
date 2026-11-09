from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from fastapi import HTTPException
from openpyxl import Workbook
from pydantic import ValidationError
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select
from starlette.datastructures import UploadFile

from app.config import get_settings
from app.dependencies import get_current_user, get_write_user
from app.models import BudgetItem, Expense, QuoteDocument, QuoteOfferRevision, QuoteProcess, User
from app.quote_schemas import (
    QuoteOfferItemInput,
    QuotePreferredOfferUpdate,
    QuoteProcessCreate,
    QuoteProcessItemInput,
    QuoteRevisionCreate,
    QuoteStatusUpdate,
    QuoteVendorOfferCreate,
)
from app.routers.quotes import (
    compare_quote_offers,
    create_offer_revision,
    create_quote_process,
    create_vendor_offer,
    deactivate_quote_document,
    get_quote_process,
    set_preferred_offer,
    update_quote_status,
    upload_quote_documents,
)
from app.routers.quotes import router as quote_router
from app.services.quote_storage import read_and_validate_upload, validate_document_content


def _pdf_bytes(label: str = "test") -> bytes:
    return f"%PDF-1.4\n% {label}\n1 0 obj<</Type/Catalog>>endobj\n%%EOF".encode()


class QuoteManagementTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.user = User(
            username="quote-admin",
            full_name="Teklif Yöneticisi",
            hashed_password="unused",
            is_admin=True,
            role="admin",
        )
        self.viewer = User(
            username="quote-viewer",
            full_name="Teklif İzleyicisi",
            hashed_password="unused",
            role="viewer",
        )
        self.session.add_all([self.user, self.viewer])
        self.session.commit()
        self.session.refresh(self.user)
        self.session.refresh(self.viewer)
        writable_temp_root = Path(__file__).resolve().parent / ".tmp"
        writable_temp_root.mkdir(parents=True, exist_ok=True)
        self.temp_dir = TemporaryDirectory(dir=writable_temp_root)
        self.previous_storage = get_settings().quote_storage_path
        get_settings().quote_storage_path = self.temp_dir.name

    def tearDown(self) -> None:
        get_settings().quote_storage_path = self.previous_storage
        self.temp_dir.cleanup()
        self.session.close()
        self.engine.dispose()

    def _create_process(self, name: str = "FortiGate 1800F"):
        return create_quote_process(
            QuoteProcessCreate(
                name=name,
                items=[
                    QuoteProcessItemInput(
                        name="FortiGate 1800F",
                        product_code="FG-1800F",
                        category="Donanım",
                    ),
                    QuoteProcessItemInput(
                        name="Güvenlik Lisansı",
                        product_code="LIC-1800F",
                        category="Lisans Uzatma",
                    ),
                ],
            ),
            self.session,
            self.user,
        )

    def _revision(self, process, *, price: str, currency: str = "USD", duration: int = 12):
        return QuoteRevisionCreate(
            quote_date=date(2026, 11, 4),
            currency=currency,
            items=[
                QuoteOfferItemInput(
                    process_item_id=process.items[0].id,
                    product_name="FortiGate 1800F",
                    product_code="FG-1800F",
                    category="Donanım",
                    quantity=Decimal("1"),
                    unit_price=Decimal(price),
                ),
                QuoteOfferItemInput(
                    process_item_id=process.items[1].id,
                    product_name="Güvenlik Lisansı",
                    product_code="LIC-1800F",
                    category="Lisans Uzatma",
                    duration_months=duration,
                    quantity=Decimal("1"),
                    unit_price=Decimal("2000.00"),
                ),
            ],
        )

    def test_year_sequence_is_unique_and_budget_data_is_untouched(self) -> None:
        budget_item = BudgetItem(code="HW-001", name="Mevcut Donanım", map_category="Donanım")
        self.session.add(budget_item)
        self.session.commit()
        self.session.refresh(budget_item)
        before_expenses = len(self.session.exec(select(Expense)).all())
        first = self._create_process("Birinci")
        second = create_quote_process(
            QuoteProcessCreate(
                name="İkinci",
                items=[
                    QuoteProcessItemInput(
                        budget_item_id=budget_item.id,
                        name=budget_item.name,
                        product_code=budget_item.code,
                        category="Donanım",
                    )
                ],
            ),
            self.session,
            self.user,
        )

        self.assertRegex(first.quote_no, r"^TKL-\d{4}-0001$")
        self.assertRegex(second.quote_no, r"^TKL-\d{4}-0002$")
        self.assertNotEqual(first.quote_no, second.quote_no)
        self.assertEqual(budget_item.id, second.items[0].budget_item_id)
        self.assertEqual("Mevcut Donanım", self.session.get(BudgetItem, budget_item.id).name)
        self.assertEqual(before_expenses, len(self.session.exec(select(Expense)).all()))

    def test_year_sequence_is_collision_free_across_parallel_sessions(self) -> None:
        database_path = Path(self.temp_dir.name) / "parallel-sequence.db"
        engine = create_engine(
            f"sqlite:///{database_path}",
            connect_args={"check_same_thread": False, "timeout": 15},
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as setup_session:
            user = User(
                username="parallel-admin",
                full_name="Paralel Yönetici",
                hashed_password="unused",
                is_admin=True,
                role="admin",
            )
            setup_session.add(user)
            setup_session.commit()
            setup_session.refresh(user)
            user_id = user.id

        def create_in_session(index: int) -> str:
            with Session(engine) as session:
                user = session.get(User, user_id)
                result = create_quote_process(
                    QuoteProcessCreate(
                        name=f"Paralel Süreç {index}",
                        items=[
                            QuoteProcessItemInput(
                                name=f"Ürün {index}",
                                category="Donanım",
                            )
                        ],
                    ),
                    session,
                    user,
                )
                return result.quote_no

        with ThreadPoolExecutor(max_workers=4) as pool:
            quote_numbers = list(pool.map(create_in_session, range(8)))
        engine.dispose()

        self.assertEqual(8, len(set(quote_numbers)))
        self.assertEqual(
            [f"TKL-{date.today().year}-{index:04d}" for index in range(1, 9)],
            sorted(quote_numbers),
        )

    def test_decimal_total_revision_history_and_preference_are_isolated(self) -> None:
        process = self._create_process()
        offer = create_vendor_offer(
            process.id,
            QuoteVendorOfferCreate(
                vendor_name="ABC Teknoloji",
                revision=self._revision(process, price="10000.005"),
            ),
            self.session,
            self.user,
        )
        self.assertEqual(Decimal("12000.01"), offer.current_revision.total_amount)

        revision_two = create_offer_revision(
            process.id,
            offer.id,
            self._revision(process, price="9700.00"),
            self.session,
            self.user,
        )
        self.assertEqual(2, revision_two.revision_no)
        detail = get_quote_process(process.id, self.session, self.user)
        self.assertEqual([2, 1], [row.revision_no for row in detail.offers[0].revisions])
        self.assertEqual(Decimal("11700.00"), detail.offers[0].current_revision.total_amount)

        set_preferred_offer(
            process.id,
            QuotePreferredOfferUpdate(offer_id=offer.id),
            self.session,
            self.user,
        )
        self.assertEqual(0, len(self.session.exec(select(Expense)).all()))

    def test_new_revisions_accept_only_usd(self) -> None:
        process = self._create_process()
        for currency in ("EUR", "TRY"):
            with self.subTest(currency=currency):
                with self.assertRaises(ValidationError) as invalid_currency:
                    self._revision(process, price="10000", currency=currency)
                self.assertIn(
                    "Yeni teklifler yalnız USD para birimiyle oluşturulabilir.",
                    str(invalid_currency.exception),
                )

        revision = self._revision(process, price="10000", currency="usd")
        self.assertEqual("USD", revision.currency)

    def test_comparison_only_marks_equivalent_usd_offers(self) -> None:
        process = self._create_process()
        first = create_vendor_offer(
            process.id,
            QuoteVendorOfferCreate(
                vendor_name="ABC Teknoloji",
                revision=self._revision(process, price="10000"),
            ),
            self.session,
            self.user,
        )
        second = create_vendor_offer(
            process.id,
            QuoteVendorOfferCreate(
                vendor_name="XYZ Bilişim",
                revision=self._revision(process, price="9800"),
            ),
            self.session,
            self.user,
        )
        comparison = compare_quote_offers(process.id, self.session, self.user)
        lowest = [row for row in comparison.offers if row.is_lowest]
        self.assertEqual([second.id], [row.offer_id for row in lowest])

        create_offer_revision(
            process.id,
            first.id,
            self._revision(process, price="9500", duration=24),
            self.session,
            self.user,
        )
        comparison = compare_quote_offers(process.id, self.session, self.user)
        self.assertFalse(any(row.is_lowest for row in comparison.offers))

    def test_documents_are_validated_persisted_and_soft_deactivated(self) -> None:
        process = self._create_process()
        offer = create_vendor_offer(
            process.id,
            QuoteVendorOfferCreate(
                vendor_name="ABC Teknoloji",
                revision=self._revision(process, price="10000"),
            ),
            self.session,
            self.user,
        )
        upload = UploadFile(BytesIO(_pdf_bytes("original")), filename="ABC_Teklif.pdf")
        second_upload = UploadFile(BytesIO(_pdf_bytes("license")), filename="ABC_Lisans.pdf")
        documents = upload_quote_documents(
            process.id,
            offer.id,
            offer.current_revision.id,
            [upload, second_upload],
            self.session,
            self.user,
        )
        self.assertEqual(2, len(documents))
        stored = self.session.get(QuoteDocument, documents[0].id)
        stored_path = Path(self.temp_dir.name) / stored.storage_key
        self.assertEqual(_pdf_bytes("original"), stored_path.read_bytes())
        self.assertEqual(64, len(stored.sha256))

        deactivated = deactivate_quote_document(stored.id, self.session, self.user)
        self.assertFalse(deactivated.is_active)
        self.assertTrue(stored_path.exists(), "Soft delete fiziksel belgeyi korumalıdır")

    def test_excel_formats_and_size_limit_are_enforced(self) -> None:
        buffer = BytesIO()
        workbook = Workbook()
        workbook.active.append(["Firma", "Tutar"])
        workbook.save(buffer)
        xlsx = validate_document_content("teklif.xlsx", buffer.getvalue())
        self.assertEqual(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            xlsx.content_type,
        )
        xls = validate_document_content(
            "teklif.xls",
            bytes.fromhex("D0CF11E0A1B11AE1") + b"legacy-excel-fixture",
        )
        self.assertEqual("application/vnd.ms-excel", xls.content_type)

        previous_limit = get_settings().quote_document_max_bytes
        get_settings().quote_document_max_bytes = 8
        try:
            with self.assertRaises(HTTPException) as too_large:
                read_and_validate_upload(
                    UploadFile(BytesIO(_pdf_bytes("too-large")), filename="buyuk.pdf")
                )
            self.assertEqual(413, too_large.exception.status_code)
        finally:
            get_settings().quote_document_max_bytes = previous_limit

    def test_invalid_content_and_viewer_mutations_are_rejected(self) -> None:
        with self.assertRaises(HTTPException) as invalid_pdf:
            validate_document_content("sahte.pdf", b"not a pdf")
        self.assertEqual(400, invalid_pdf.exception.status_code)

        with self.assertRaises(HTTPException) as viewer_error:
            get_write_user(self.viewer)
        self.assertEqual(403, viewer_error.exception.status_code)

    def test_quote_api_routes_keep_existing_read_and_write_role_guards(self) -> None:
        mutation_methods = {"POST", "PUT", "PATCH", "DELETE"}
        for route in quote_router.routes:
            dependency_calls = {
                dependency.call for dependency in route.dependant.dependencies
            }
            with self.subTest(path=route.path, methods=tuple(sorted(route.methods))):
                if route.methods & mutation_methods:
                    self.assertIn(get_write_user, dependency_calls)
                if "GET" in route.methods:
                    self.assertIn(get_current_user, dependency_calls)

    def test_archive_keeps_revisions_and_documents(self) -> None:
        process = self._create_process()
        offer = create_vendor_offer(
            process.id,
            QuoteVendorOfferCreate(
                vendor_name="ABC Teknoloji",
                revision=self._revision(process, price="10000"),
            ),
            self.session,
            self.user,
        )
        upload_quote_documents(
            process.id,
            offer.id,
            offer.current_revision.id,
            [UploadFile(BytesIO(_pdf_bytes()), filename="teklif.pdf")],
            self.session,
            self.user,
        )
        update_quote_status(
            process.id,
            QuoteStatusUpdate(status="ARCHIVED"),
            self.session,
            self.user,
        )
        self.assertEqual("ARCHIVED", self.session.get(QuoteProcess, process.id).status)
        self.assertEqual(1, len(self.session.exec(select(QuoteOfferRevision)).all()))
        self.assertEqual(1, len(self.session.exec(select(QuoteDocument)).all()))
        with self.assertRaises(HTTPException) as archived_write:
            create_offer_revision(
                process.id,
                offer.id,
                self._revision(process, price="9000"),
                self.session,
                self.user,
            )
        self.assertEqual(409, archived_write.exception.status_code)


if __name__ == "__main__":
    unittest.main()
