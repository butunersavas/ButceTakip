from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlmodel import Session

from app.dependencies import get_admin_user, get_current_user, get_db_session
from app.schemas import CleanupRequest, ImportSummary
from app.services import cleanup as cleanup_service
from app.services import exporter, importer

router = APIRouter(prefix="/io", tags=["Import & Export"])


@router.post("/import/json", response_model=ImportSummary)
def import_json(
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
    _= Depends(get_current_user),
) -> ImportSummary:
    return importer.import_json(file, session)


@router.post("/import/csv", response_model=ImportSummary)
def import_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
    _= Depends(get_current_user),
) -> ImportSummary:
    return importer.import_csv(file, session)


@router.get("/export/csv")
def export_csv(
    year: int = Query(...),
    scenario_id: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _= Depends(get_current_user),
):
    return exporter.export_csv(session, year, scenario_id, budget_item_id)


@router.get("/export/xlsx")
def export_xlsx(
    year: int = Query(...),
    scenario_id: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _= Depends(get_current_user),
):
    return exporter.export_xlsx(session, year, scenario_id, budget_item_id)


@router.post("/cleanup")
def cleanup(
    request: CleanupRequest,
    session: Session = Depends(get_db_session),
    _= Depends(get_admin_user),
):
    result = cleanup_service.perform_cleanup(session, request)
    return {"status": "ok", **result}
