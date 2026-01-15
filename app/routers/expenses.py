from datetime import date, datetime
import ipaddress

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, Expense, ExpenseStatus, Scenario, User
from app.schemas import ExpenseCreate, ExpenseRead, ExpenseUpdate

router = APIRouter(prefix="/expenses", tags=["Expenses"])


def _extract_client_identifier(request: Request) -> str | None:
    header_candidates = [
        "x-forwarded-for",
        "x-real-ip",
        "x-client-ip",
        "cf-connecting-ip",
        "true-client-ip",
    ]

    for header_name in header_candidates:
        header_value = request.headers.get(header_name)
        if not header_value:
            continue

        first_value = header_value.split(",")[0].strip()
        if not first_value or first_value.lower() == "localhost":
            continue

        try:
            ip_value = ipaddress.ip_address(first_value)
        except ValueError:
            return first_value

        if not (ip_value.is_loopback or ip_value.is_unspecified):
            return first_value

    return None


def _normalize_capex_opex(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized in {"capex", "opex"}:
        return normalized
    return None


def _user_display_name(user: User | None) -> str | None:
    if not user:
        return None
    return user.full_name or user.username or user.email


def _attach_user_names(session: Session, expenses: list[Expense]) -> None:
    user_ids: set[int] = set()
    for expense in expenses:
        if expense.created_by_user_id:
            user_ids.add(expense.created_by_user_id)
        elif expense.created_by_id:
            user_ids.add(expense.created_by_id)
        if expense.updated_by_id:
            user_ids.add(expense.updated_by_id)
        if expense.updated_by_user_id:
            user_ids.add(expense.updated_by_user_id)
    if not user_ids:
        return
    users = session.exec(select(User).where(User.id.in_(user_ids))).all()
    user_map = {user.id: _user_display_name(user) for user in users}
    for expense in expenses:
        created_id = expense.created_by_user_id or expense.created_by_id
        updated_id = expense.updated_by_user_id or expense.updated_by_id
        expense.created_by_name = user_map.get(created_id) if created_id else None
        expense.updated_by_name = user_map.get(updated_id) if updated_id else None
        expense.created_by_username = expense.created_by_name
        expense.updated_by_username = expense.updated_by_name


@router.get("/", response_model=list[ExpenseRead])
def list_expenses(
    year: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    scenario_id: int | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    include_out_of_budget: bool = Query(default=True),
    show_cancelled: bool = Query(default=False),
    show_out_of_budget: bool = Query(default=False),
    mine_only: bool = Query(default=False),
    today_only: bool = Query(default=False),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[Expense]:
    query = select(Expense)
    capex_filter = _normalize_capex_opex(capex_opex)
    if capex_filter:
        query = query.join(BudgetItem, BudgetItem.id == Expense.budget_item_id).where(
            func.lower(BudgetItem.map_category) == capex_filter
        )
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
    if not show_cancelled:
        query = query.where(Expense.status != ExpenseStatus.CANCELLED)
    if not (include_out_of_budget and show_out_of_budget):
        query = query.where(Expense.is_out_of_budget.is_(False))
    if mine_only:
        query = query.where(
            func.coalesce(Expense.created_by_user_id, Expense.created_by_id) == current_user.id
        )
    expenses = session.exec(query.order_by(Expense.expense_date.desc())).all()
    _attach_user_names(session, expenses)
    return expenses


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
    client_hostname = expense_in.client_hostname or _extract_client_identifier(request)

    quantity = expense_in.quantity or 1
    unit_price = expense_in.unit_price or 0

    if not expense_in.amount and quantity and unit_price:
        expense_in.amount = round(quantity * unit_price, 2)

    expense_data = expense_in.dict(exclude={"client_hostname", "kaydi_giren_kullanici"})
    expense = Expense(
        **expense_data,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
        client_hostname=client_hostname,
        kaydi_giren_kullanici=current_user.username,
    )
    session.add(expense)
    session.commit()
    session.refresh(expense)
    _attach_user_names(session, [expense])
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
    owner_id = expense.created_by_user_id or expense.created_by_id
    if owner_id not in (None, current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    for field, value in expense_in.dict(exclude_unset=True).items():
        if field == "kaydi_giren_kullanici":
            continue
        setattr(expense, field, value)

    quantity = expense.quantity or 1
    unit_price = expense.unit_price or 0
    if not expense.amount and quantity and unit_price:
        expense.amount = round(quantity * unit_price, 2)

    expense.updated_by_user_id = current_user.id
    expense.updated_by_id = current_user.id
    expense.updated_at = datetime.utcnow()
    session.add(expense)
    session.commit()
    session.refresh(expense)
    _attach_user_names(session, [expense])
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
    owner_id = expense.created_by_user_id or expense.created_by_id
    if owner_id not in (None, current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    session.delete(expense)
    session.commit()
