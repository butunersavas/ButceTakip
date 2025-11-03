import csv
import io

import pytest
from fastapi import UploadFile
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import BudgetItem, Expense, PlanEntry
from app.services import importer


@pytest.fixture()
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
        session.rollback()


def _build_upload_file(rows: list[list[str]]) -> UploadFile:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    for row in rows:
        writer.writerow(row)
    file = io.BytesIO(buffer.getvalue().encode("utf-8"))
    file.seek(0)
    return UploadFile(filename="import.csv", file=file)


def test_import_csv_preserves_map_attribute(session: Session):
    upload = _build_upload_file(
        [
            [
                "Type",
                "Budget Code",
                "Budget Name",
                "Map-Nitelik",
                "Scenario",
                "Year",
                "Month",
                "Amount",
                "Date",
                "Quantity",
                "Unit Price",
                "Vendor",
                "Description",
                "Out_of_Budget",
            ],
            [
                "plan",
                "BT-100",
                "Genel Giderler",
                "Hizmet",
                "Ana Senaryo",
                "2024",
                "1",
                "15000",
                "",
                "",
                "",
                "",
                "",
                "",
            ],
            [
                "expense",
                "BT-100",
                "Genel Giderler",
                "Hizmet",
                "Ana Senaryo",
                "2024",
                "",
                "12000",
                "2024-02-15",
                "1",
                "12000",
                "ACME Ltd",
                "Reklam",
                "true",
            ],
        ]
    )

    summary = importer.import_csv(upload, session)

    assert summary.imported_plans == 1
    assert summary.imported_expenses == 1

    budget_item = session.exec(select(BudgetItem)).one()
    assert budget_item.map_attribute == "Hizmet"

    plan = session.exec(select(PlanEntry)).one()
    assert plan.year == 2024
    assert plan.month == 1
    assert plan.amount == pytest.approx(15000.0)

    expense = session.exec(select(Expense)).one()
    assert expense.amount == pytest.approx(12000.0)
    assert expense.is_out_of_budget is True
    assert expense.expense_date.isoformat() == "2024-02-15"
