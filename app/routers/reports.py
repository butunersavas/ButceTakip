import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.dependencies import get_current_user, get_db_session
from app.schemas import PurchaseFormPreparedReportItem
from app.services import exporter

router = APIRouter(prefix="/reports", tags=["Reports"])
logger = logging.getLogger(__name__)

MONTH_MAP_TR = {
    "ocak": 1,
    "şubat": 2,
    "subat": 2,
    "mart": 3,
    "nisan": 4,
    "mayıs": 5,
    "mayis": 5,
    "haziran": 6,
    "temmuz": 7,
    "ağustos": 8,
    "agustos": 8,
    "eylül": 9,
    "eylul": 9,
    "ekim": 10,
    "kasım": 11,
    "kasim": 11,
    "aralık": 12,
    "aralik": 12,
}


def normalize_month(value: str | int | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        if 1 <= value <= 12:
            return value
        raise HTTPException(status_code=422, detail="Ay 1-12 arasında olmalıdır")

    raw = value.strip()
    if not raw:
        return None

    if raw.isdigit():
        numeric = int(raw)
        if 1 <= numeric <= 12:
            return numeric
        raise HTTPException(status_code=422, detail="Ay 1-12 arasında olmalıdır")

    month = MONTH_MAP_TR.get(raw.lower())
    if month is None:
        raise HTTPException(status_code=422, detail="Geçersiz ay değeri")
    return month


@router.get("/purchase-forms-prepared", response_model=list[PurchaseFormPreparedReportItem])
def get_purchase_forms_prepared_report(
    year: int = Query(...),
    scenario_id: int | None = Query(None),
    month: str | int | None = Query(default=None),
    department: str | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _= Depends(get_current_user),
) -> list[PurchaseFormPreparedReportItem]:
    normalized_month = normalize_month(month)
    items = exporter.get_purchase_forms_prepared(
        session, year, scenario_id, normalized_month, department, budget_item_id, capex_opex
    )
    logger.info(
        "report_debug export_type=%s year=%s month=%s scenario=%s department=%s budget_item=%s row_count=%s",
        "purchase_forms_prepared",
        year,
        normalized_month,
        scenario_id,
        department,
        budget_item_id,
        len(items),
    )
    return items


@router.get("/purchase-forms-prepared/xlsx")
def download_purchase_forms_prepared_xlsx(
    year: int = Query(...),
    scenario_id: int | None = Query(None),
    month: str | int | None = Query(default=None),
    department: str | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _= Depends(get_current_user),
):
    normalized_month = normalize_month(month)
    return exporter.export_purchase_forms_prepared_xlsx(
        session,
        year,
        scenario_id,
        normalized_month,
        department,
        budget_item_id,
        capex_opex,
    )
