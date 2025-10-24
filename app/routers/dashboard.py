from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.dependencies import get_current_user, get_db_session
from app.schemas import DashboardKPI, DashboardResponse, DashboardSummary
from app.services.analytics import compute_monthly_summary, totalize

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    year: int = Query(..., description="Year to summarize"),
    scenario_id: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _= Depends(get_current_user),
) -> DashboardResponse:
    if year is None:
        raise HTTPException(status_code=400, detail="Year is required")
    monthly = compute_monthly_summary(session, year, scenario_id, budget_item_id)
    total_plan, total_actual = totalize(monthly)
    total_remaining = total_plan - total_actual
    total_saving = sum(item.saving for item in monthly if item.saving > 0)
    total_overrun = sum(-item.saving for item in monthly if item.saving < 0)
    return DashboardResponse(
        kpi=DashboardKPI(
            total_plan=total_plan,
            total_actual=total_actual,
            total_remaining=total_remaining,
            total_saving=total_saving,
            total_overrun=total_overrun,
        ),
        monthly=[
            DashboardSummary(month=item.month, planned=item.planned, actual=item.actual, saving=item.saving)
            for item in monthly
        ],
    )
