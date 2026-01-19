from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import selectinload
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
    query = select(PlanEntry).options(
        selectinload(PlanEntry.scenario),
        selectinload(PlanEntry.budget_item),
    )
    capex_filter = _normalize_capex_opex(capex_opex)
    if capex_filter:
        query = query.join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id).where(
            func.lower(BudgetItem.map_category) == capex_filter
        )
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
    plans = session.exec(query).all()
    missing_codes = {
        plan.budget_code
        for plan in plans
        if not plan.budget_item and getattr(plan, "budget_code", None)
    }
    if missing_codes:
        fallback_items = session.exec(select(BudgetItem).where(BudgetItem.code.in_(missing_codes))).all()
        fallback_map = {item.code: item for item in fallback_items}
        for plan in plans:
            if not plan.budget_item and plan.budget_code:
                plan.budget_item = fallback_map.get(plan.budget_code)
    results: list[PlanEntryRead] = []
    for plan in plans:
        budget = plan.budget_item
        read_item = PlanEntryRead.from_orm(plan)
        if budget:
            read_item.capex_opex = budget.map_category.title() if budget.map_category else None
            read_item.asset_type = budget.map_attribute
            read_item.budget_item_name = budget.name
        if plan.scenario:
            read_item.scenario_name = plan.scenario.name
        results.append(read_item)
    return results


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
) -> PlanEntry:
    if not session.get(Scenario, plan_in.scenario_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Scenario not found")
    if not session.get(BudgetItem, plan_in.budget_item_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budget item not found")
    plan = PlanEntry(**plan_in.dict())
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return plan


@router.put("/{plan_id}", response_model=PlanEntryRead)
@router.put("/{plan_id}/", response_model=PlanEntryRead, include_in_schema=False)
def update_plan_entry(
    plan_id: int,
    plan_in: PlanEntryUpdate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> PlanEntry:
    plan = session.get(PlanEntry, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    for field, value in plan_in.dict(exclude_unset=True).items():
        setattr(plan, field, value)
    plan.updated_at = datetime.utcnow()
    session.add(plan)
    session.commit()
    session.refresh(plan)
    return plan


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
