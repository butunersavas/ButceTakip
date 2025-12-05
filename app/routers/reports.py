from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.dependencies import get_current_user, get_db_session
from app.schemas import PurchaseFormPreparedReportItem
from app.services import exporter

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/purchase-forms-prepared", response_model=list[PurchaseFormPreparedReportItem])
def get_purchase_forms_prepared_report(
    year: int = Query(...),
    scenario_id: int | None = Query(None),
    session: Session = Depends(get_db_session),
    _= Depends(get_current_user),
) -> list[PurchaseFormPreparedReportItem]:
    return exporter.get_purchase_forms_prepared(session, year, scenario_id)


@router.get("/purchase-forms-prepared/xlsx")
def download_purchase_forms_prepared_xlsx(
    year: int = Query(...),
    scenario_id: int | None = Query(None),
    session: Session = Depends(get_db_session),
    _= Depends(get_current_user),
):
    return exporter.export_purchase_forms_prepared_xlsx(session, year, scenario_id)
