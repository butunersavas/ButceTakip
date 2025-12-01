from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, Expense, ExpenseStatus, Scenario, User
from app.schemas import ExpenseCreate, ExpenseRead, ExpenseUpdate

router = APIRouter(prefix="/expenses", tags=["Expenses"])


@router.get("/", response_model=list[ExpenseRead])
def list_expenses(
    year: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    include_out_of_budget: bool = Query(default=True),
    mine_only: bool = Query(default=False),
    today_only: bool = Query(default=False),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[Expense]:
    query = select(Expense)
    if today_only:
        query = query.where(Expense.expense_date == date.today())
    elif year is not None:
        query = query.where(Expense.expense_date >= date(year, 1, 1)).where(
            Expense.expense_date <= date(year, 12, 31)
        )
    if budget_item_id is not None:
        query = query.where(Expense.budget_item_id == budget_item_id)
    if scenario_id is not None:
        query = query.where(Expense.scenario_id == scenario_id)
    if not today_only:
        if start_date is not None:
            query = query.where(Expense.expense_date >= start_date)
        if end_date is not None:
            query = query.where(Expense.expense_date <= end_date)
    if status_filter is not None:
        raw_statuses = [status_filter] if "," not in status_filter else status_filter.split(",")
        statuses = []
        for raw in raw_statuses:
            raw_clean = raw.strip().lower()
            try:
                statuses.append(ExpenseStatus(raw_clean))
            except ValueError:
                continue
        if statuses:
            query = query.where(Expense.status.in_(statuses))
    if not include_out_of_budget:
        query = query.where(Expense.is_out_of_budget.is_(False))
    if mine_only:
        query = query.where(Expense.created_by_id == current_user.id)
    return session.exec(query.order_by(Expense.expense_date.desc())).all()


@router.post("/", response_model=ExpenseRead, status_code=201)
def create_expense(
    expense_in: ExpenseCreate,
    request: Request,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Expense:
    if not session.get(BudgetItem, expense_in.budget_item_id):
        raise HTTPException(status_code=400, detail="Budget item not found")
    if expense_in.scenario_id and not session.get(Scenario, expense_in.scenario_id):
        raise HTTPException(status_code=400, detail="Scenario not found")
    client_hostname = expense_in.client_hostname or request.headers.get("X-Client-Hostname")
    if not client_hostname and request.client:
        client_hostname = request.client.host
    expense = Expense(
        **expense_in.dict(),
        created_by_id=current_user.id,
        client_hostname=client_hostname,
    )
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


@router.put("/{expense_id}", response_model=ExpenseRead)
def update_expense(
    expense_id: int,
    expense_in: ExpenseUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Expense:
    expense = session.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if expense.created_by_id not in (None, current_user.id) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    for field, value in expense_in.dict(exclude_unset=True).items():
        setattr(expense, field, value)
    expense.updated_at = datetime.utcnow()
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    expense = session.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    if expense.created_by_id not in (None, current_user.id) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    session.delete(expense)
    session.commit()
