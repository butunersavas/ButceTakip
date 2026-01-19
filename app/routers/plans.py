from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.dependencies import get_admin_user, get_current_user, get_db_session
from app.models import BudgetItem, PlanEntry, Scenario, User
from app.schemas import PlanAggregateRead, PlanEntryCreate, PlanEntryRead, PlanEntryUpdate

router = APIRouter(prefix="/plans", tags=["Plans"])


def _normalize_capex_opex(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized in {"capex", "opex"}:
        return normalized
    return None


def _plan_read_query(capex_filter: str | None):
    query = (
        select(
            PlanEntry.id,
            PlanEntry.year,
            PlanEntry.month,
            PlanEntry.amount,
            PlanEntry.scenario_id,
            PlanEntry.budget_item_id,
            PlanEntry.department,
            Scenario.name.label("scenario_name"),
            BudgetItem.code.label("budget_code"),
            BudgetItem.name.label("budget_name"),
            BudgetItem.map_category.label("capex_opex"),
            BudgetItem.map_attribute.label("asset_type"),
        )
        .select_from(PlanEntry)
        .join(Scenario, Scenario.id == PlanEntry.scenario_id)
        .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
    )
    if capex_filter:
        query = query.where(func.lower(BudgetItem.map_category) == capex_filter)
    return query


def _build_plan_read(row: dict) -> PlanEntryRead:
    return PlanEntryRead(
        id=row.get("id"),
        year=row.get("year"),
        month=row.get("month"),
        amount=row.get("amount"),
        scenario_id=row.get("scenario_id"),
        budget_item_id=row.get("budget_item_id"),
        department=row.get("department"),
        scenario_name=row.get("scenario_name"),
        budget_code=row.get("budget_code"),
        budget_name=row.get("budget_name"),
        capex_opex=row.get("capex_opex").title() if row.get("capex_opex") else None,
        asset_type=row.get("asset_type"),
    )


def _fetch_plan_read(session: Session, plan_id: int) -> PlanEntryRead:
    row = session.exec(_plan_read_query(None).where(PlanEntry.id == plan_id)).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return _build_plan_read(row._mapping)


@router.get("", response_model=list[PlanEntryRead])
@router.get("/", response_model=list[PlanEntryRead], include_in_schema=False)
def list_plans(
    year: int = Query(...),
    scenario_id: int | None = None,
    budget_item_id: int | None = None,
    month: int | None = Query(default=None),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[PlanEntryRead]:
    capex_filter = _normalize_capex_opex(capex_opex)
    query = _plan_read_query(capex_filter)
    if year is not None:
        query = query.where(PlanEntry.year == year)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    if budget_item_id is not None:
        query = query.where(PlanEntry.budget_item_id == budget_item_id)
    if month is not None:
        query = query.where(PlanEntry.month == month)
    if department is not None:
        query = query.where(PlanEntry.department == department)
    rows = session.exec(query).all()
    return [_build_plan_read(row._mapping) for row in rows]


@router.get("/aggregate", response_model=list[PlanAggregateRead])
@router.get("/aggregate/", response_model=list[PlanAggregateRead], include_in_schema=False)
def aggregate_plans(
    year: int = Query(...),
    scenario_id: int | None = None,
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
):
    query = select(PlanEntry)
    query = query.where(PlanEntry.year == year)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    capex_filter = _normalize_capex_opex(capex_opex)
    if capex_filter:
        query = query.join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id).where(
            func.lower(BudgetItem.map_category) == capex_filter
        )
    plans = session.exec(query).all()
    aggregates: dict[tuple[int, int], float] = {}
    for plan in plans:
        key = (plan.budget_item_id, plan.month)
        aggregates[key] = aggregates.get(key, 0.0) + plan.amount
    return [
        PlanAggregateRead(budget_item_id=budget_item, month=month, total_amount=float(amount))
        for (budget_item, month), amount in sorted(aggregates.items())
    ]


@router.get("/departments", response_model=list[str])
@router.get("/departments/", response_model=list[str], include_in_schema=False)
def list_departments(
    year: int | None = None,
    scenario_id: int | None = None,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> list[str]:
    query = select(PlanEntry.department).where(PlanEntry.department.is_not(None))
    if year is not None:
        query = query.where(PlanEntry.year == year)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)

    departments = session.exec(query.distinct()).all()
    return sorted({dept for dept in departments if dept})


@router.post("", response_model=PlanEntryRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=PlanEntryRead, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_plan_entry(
    plan_in: PlanEntryCreate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> PlanEntryRead:
    if not session.get(Scenario, plan_in.scenario_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scenario not found")
    if not session.get(BudgetItem, plan_in.budget_item_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budget item not found")
    plan = PlanEntry(**plan_in.dict())
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _fetch_plan_read(session, plan.id)


@router.put("/{plan_id}", response_model=PlanEntryRead)
@router.put("/{plan_id}/", response_model=PlanEntryRead, include_in_schema=False)
def update_plan_entry(
    plan_id: int,
    plan_in: PlanEntryUpdate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> PlanEntryRead:
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    for field, value in plan_in.dict(exclude_unset=True).items():
        setattr(plan, field, value)
    plan.updated_at = datetime.utcnow()
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return _fetch_plan_read(session, plan.id)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{plan_id}/", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
def delete_plan_entry(
    plan_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> None:
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    session.delete(plan)
    session.commit()
