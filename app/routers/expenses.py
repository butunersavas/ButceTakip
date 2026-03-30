from datetime import date, datetime
import ipaddress
import logging
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import aliased
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, Expense, ExpenseStatus, PlanEntry, Scenario, User
from app.schemas import ExpenseCreate, ExpenseRead, ExpenseUpdate, PlannedAmountResponse

router = APIRouter(prefix="/expenses", tags=["Expenses"])
logger = logging.getLogger(__name__)


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


def _build_expense_read(
    row: dict,
    department_map: dict[tuple[int, int | None], str] | None = None,
) -> ExpenseRead:
    created_name = (
        row.get("created_full_name")
        or row.get("created_username")
        or row.get("created_email")
    )
    updated_name = (
        row.get("updated_full_name")
        or row.get("updated_username")
        or row.get("updated_email")
    )
    capex_opex = (
        str(row.get("capex_opex")).title() if row.get("capex_opex") else None
    )
    department = None
    if department_map:
        key = (row.get("budget_item_id"), row.get("scenario_id"))
        department = department_map.get(key) or department_map.get(
            (row.get("budget_item_id"), None)
        )
    status = row.get("status")
    return ExpenseRead(
        id=row.get("id"),
        budget_item_id=row.get("budget_item_id"),
        scenario_id=row.get("scenario_id"),
        expense_date=row.get("expense_date"),
        amount=row.get("amount"),
        quantity=row.get("quantity"),
        unit_price=row.get("unit_price"),
        vendor=row.get("vendor"),
        description=row.get("description"),
        status=status,
        is_out_of_budget=row.get("is_out_of_budget"),
        is_cancelled=status == ExpenseStatus.CANCELLED if status else None,
        created_by_name=created_name,
        updated_by_name=updated_name,
        created_by_username=created_name,
        updated_by_username=updated_name,
        scenario_name=row.get("scenario_name"),
        budget_code=row.get("expense_budget_code") or row.get("budget_code"),
        budget_name=row.get("budget_name"),
        capex_opex=capex_opex,
        department=department,
        asset_type=row.get("asset_type"),
        planned_amount=row.get("planned_amount"),
        spent_amount=row.get("spent_amount"),
        saving_amount=row.get("saving_amount"),
        saving_pct=row.get("saving_pct"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


def _build_department_map(
    session: Session,
    budget_ids: set[int],
    year: int | None,
    scenario_id: int | None,
) -> dict[tuple[int, int | None], str]:
    if not budget_ids:
        return {}
    query = (
        select(PlanEntry.budget_item_id, PlanEntry.scenario_id, PlanEntry.department)
        .where(PlanEntry.department.is_not(None))
        .where(PlanEntry.budget_item_id.in_(budget_ids))
    )
    if year is not None:
        query = query.where(PlanEntry.year == year)
    if scenario_id is not None:
        query = query.where(PlanEntry.scenario_id == scenario_id)
    rows = session.exec(query).all()
    return {
        (row.budget_item_id, row.scenario_id): row.department
        for row in rows
        if row.department
    }


def _expense_read_query(
    capex_filter: str | None,
) -> select:
    created_user = aliased(User)
    updated_user = aliased(User)
    query = (
        select(
            Expense.id,
            Expense.budget_item_id,
            Expense.scenario_id,
            Expense.expense_date,
            Expense.amount,
            Expense.quantity,
            Expense.unit_price,
            Expense.vendor,
            Expense.description,
            Expense.status,
            Expense.is_out_of_budget,
            Expense.budget_code.label("expense_budget_code"),
            Expense.created_at,
            Expense.updated_at,
            Expense.created_by_id,
            Expense.updated_by_id,
            Expense.created_by_user_id,
            Expense.updated_by_user_id,
            Expense.client_hostname,
            Expense.kaydi_giren_kullanici,
            BudgetItem.code.label("budget_code"),
            BudgetItem.name.label("budget_name"),
            BudgetItem.map_category.label("capex_opex"),
            BudgetItem.map_attribute.label("asset_type"),
            Scenario.name.label("scenario_name"),
            created_user.full_name.label("created_full_name"),
            created_user.username.label("created_username"),
            created_user.email.label("created_email"),
            updated_user.full_name.label("updated_full_name"),
            updated_user.username.label("updated_username"),
            updated_user.email.label("updated_email"),
        )
        .select_from(Expense)
        .outerjoin(
            BudgetItem,
            or_(
                and_(Expense.budget_code.is_not(None), BudgetItem.code == Expense.budget_code),
                and_(Expense.budget_code.is_(None), BudgetItem.id == Expense.budget_item_id),
            ),
        )
        .outerjoin(Scenario, Scenario.id == Expense.scenario_id)
        .outerjoin(
            created_user,
            created_user.id == func.coalesce(Expense.created_by_user_id, Expense.created_by_id),
        )
        .outerjoin(
            updated_user,
            updated_user.id == func.coalesce(Expense.updated_by_user_id, Expense.updated_by_id),
        )
    )
    if capex_filter:
        query = query.where(func.lower(BudgetItem.map_category) == capex_filter)
    return query


def _build_expense_saving_map(
    session: Session,
    *,
    year: int | None = None,
    scenario_id: int | None = None,
    month: int | None = None,
) -> dict[tuple[int, int | None, int | None], dict[str, float | None]]:
    plan_query = select(
        PlanEntry.budget_item_id,
        PlanEntry.scenario_id,
        PlanEntry.month,
        func.sum(PlanEntry.amount).label("planned_amount"),
    )
    if year is not None:
        plan_query = plan_query.where(PlanEntry.year == year)
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
    if month is not None:
        plan_query = plan_query.where(PlanEntry.month == month)
    plan_rows = session.exec(
        plan_query.group_by(PlanEntry.budget_item_id, PlanEntry.scenario_id, PlanEntry.month)
    ).all()

    expense_query = select(
        Expense.budget_item_id,
        Expense.scenario_id,
        func.extract("month", Expense.expense_date).label("month"),
        func.sum(Expense.amount).label("spent_amount"),
    ).where(Expense.status == ExpenseStatus.RECORDED)
    if year is not None:
        expense_query = expense_query.where(func.extract("year", Expense.expense_date) == year)
    if scenario_id is not None:
        expense_query = expense_query.where(Expense.scenario_id == scenario_id)
    if month is not None:
        expense_query = expense_query.where(func.extract("month", Expense.expense_date) == month)
    expense_rows = session.exec(
        expense_query.group_by(
            Expense.budget_item_id, Expense.scenario_id, func.extract("month", Expense.expense_date)
        )
    ).all()

    merged: dict[tuple[int, int | None, int | None], dict[str, float | None]] = {}
    for row in plan_rows:
        key = (int(row.budget_item_id), row.scenario_id, int(row.month))
        planned = float(row.planned_amount or 0)
        merged[key] = {"planned_amount": planned, "spent_amount": 0.0, "saving_amount": planned, "saving_pct": 100.0}
    for row in expense_rows:
        key = (int(row.budget_item_id), row.scenario_id, int(row.month))
        spent = float(row.spent_amount or 0)
        current = merged.get(key, {"planned_amount": 0.0})
        planned = float(current.get("planned_amount") or 0)
        saving = max(planned - spent, 0.0)
        pct = ((saving / planned) * 100) if planned > 0 else None
        merged[key] = {
            "planned_amount": planned,
            "spent_amount": spent,
            "saving_amount": saving,
            "saving_pct": pct,
        }
    return merged


def _fetch_expense_read(
    session: Session,
    expense_id: int,
    year: int | None = None,
    scenario_id: int | None = None,
) -> ExpenseRead:
    query = _expense_read_query(None).where(Expense.id == expense_id)
    row = session.exec(query).first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    department_map = _build_department_map(
        session,
        {row.budget_item_id},
        year,
        scenario_id,
    )
    return _build_expense_read(row._mapping, department_map)


@router.get("", response_model=list[ExpenseRead])
@router.get("/", response_model=list[ExpenseRead], include_in_schema=False)
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
) -> list[ExpenseRead]:
    capex_filter = _normalize_capex_opex(capex_opex)
    query = _expense_read_query(capex_filter)
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
    try:
        rows = session.exec(query.order_by(Expense.expense_date.desc())).all()
    except Exception as exc:
        logger.exception("Failed to list expenses")
        raise HTTPException(
            status_code=500,
            detail=f"Harcama listesi alınırken bir hata oluştu: {exc}",
        )
    budget_ids = {row.budget_item_id for row in rows}
    department_map = _build_department_map(session, budget_ids, year, scenario_id)
    savings_map = _build_expense_saving_map(
        session,
        year=year,
        scenario_id=scenario_id,
    )
    return [
        _build_expense_read(
            {
                **row._mapping,
                **(savings_map.get(
                    (
                        int(row.budget_item_id),
                        row.scenario_id,
                        int(row.expense_date.month) if row.expense_date else None,
                    ),
                    {},
                )),
            },
            department_map,
        )
        for row in rows
    ]


@router.post("", response_model=ExpenseRead, status_code=201)
@router.post("/", response_model=ExpenseRead, status_code=201, include_in_schema=False)
def create_expense(
    expense_in: ExpenseCreate,
    request: Request,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExpenseRead:
    if not expense_in.scenario_id:
        raise HTTPException(status_code=400, detail="scenario_id is required")
    budget_item = session.get(BudgetItem, expense_in.budget_item_id)
    if not budget_item:
        raise HTTPException(status_code=400, detail="Budget item not found")
    if not session.get(Scenario, expense_in.scenario_id):
        raise HTTPException(status_code=400, detail="Invalid scenario_id")
    client_hostname = expense_in.client_hostname or _extract_client_identifier(request)

    quantity = expense_in.quantity or 1
    unit_price = expense_in.unit_price or 0
    if expense_in.amount is None:
        expense_in.amount = round(quantity * unit_price, 2)

    expense_data = expense_in.dict(exclude={"client_hostname", "kaydi_giren_kullanici"})
    expense = Expense(
        **expense_data,
        budget_code=budget_item.code,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
        created_by_user_id=current_user.id,
        updated_by_user_id=current_user.id,
        client_hostname=client_hostname,
        kaydi_giren_kullanici=current_user.username,
    )
    try:
        session.add(expense)
        session.commit()
        session.refresh(expense)
    except SQLAlchemyError as exc:
        session.rollback()
        detail = str(exc.orig) if getattr(exc, "orig", None) else "DB constraint error"
        raise HTTPException(status_code=400, detail=detail)
    return _fetch_expense_read(session, expense.id, scenario_id=expense.scenario_id)


@router.put("/{expense_id}", response_model=ExpenseRead)
@router.put("/{expense_id}/", response_model=ExpenseRead, include_in_schema=False)
def update_expense(
    expense_id: int,
    expense_in: ExpenseUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> ExpenseRead:
    expense = session.get(Expense, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    owner_id = expense.created_by_user_id or expense.created_by_id
    if owner_id not in (None, current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    update_data = expense_in.dict(exclude_unset=True)
    if "budget_item_id" in update_data:
        budget_item = session.get(BudgetItem, update_data["budget_item_id"])
        if not budget_item:
            raise HTTPException(status_code=400, detail="Budget item not found")
        update_data["budget_code"] = budget_item.code
    elif expense.budget_code is None:
        budget_item = session.get(BudgetItem, expense.budget_item_id)
        if budget_item:
            update_data["budget_code"] = budget_item.code

    for field, value in update_data.items():
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
    try:
        session.add(expense)
        session.commit()
        session.refresh(expense)
    except SQLAlchemyError as exc:
        session.rollback()
        detail = str(exc.orig) if getattr(exc, "orig", None) else "DB constraint error"
        raise HTTPException(status_code=400, detail=detail)
    return _fetch_expense_read(session, expense.id, scenario_id=expense.scenario_id)


@router.delete("/{expense_id}", status_code=204)
@router.delete("/{expense_id}/", status_code=204, include_in_schema=False)
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


@router.get("/planned-amount", response_model=PlannedAmountResponse)
def get_expense_planned_amount(
    year: int = Query(...),
    scenario_id: int | None = Query(default=None),
    month: int | None = Query(default=None, ge=1, le=12),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
) -> PlannedAmountResponse:
    plan_query = select(func.coalesce(func.sum(PlanEntry.amount), 0.0)).where(PlanEntry.year == year)
    actual_query = select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
        func.extract("year", Expense.expense_date) == year,
        Expense.status == ExpenseStatus.RECORDED,
    )
    if scenario_id is not None:
        plan_query = plan_query.where(PlanEntry.scenario_id == scenario_id)
        actual_query = actual_query.where(Expense.scenario_id == scenario_id)
    if month is not None:
        plan_query = plan_query.where(PlanEntry.month == month)
        actual_query = actual_query.where(func.extract("month", Expense.expense_date) == month)

    planned_amount = float(session.exec(plan_query).first() or 0.0)
    actual_amount = float(session.exec(actual_query).first() or 0.0)
    return PlannedAmountResponse(
        year=year,
        scenario_id=scenario_id,
        month=month,
        planned_amount=planned_amount,
        actual_amount=actual_amount,
        saving_amount=planned_amount - actual_amount,
    )


@router.get("/planned-amount/by-item")
def get_expense_planned_amount_by_item(
    year: int = Query(...),
    scenario_id: int = Query(...),
    budget_item_id: int = Query(...),
    month: int | None = Query(default=None, ge=1, le=12),
    department: str | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
):
    query = (
        select(PlanEntry)
        .join(BudgetItem, BudgetItem.id == PlanEntry.budget_item_id)
        .where(PlanEntry.year == year)
        .where(PlanEntry.scenario_id == scenario_id)
        .where(PlanEntry.budget_item_id == budget_item_id)
    )
    if month is not None:
        query = query.where(PlanEntry.month == month)
    if department:
        query = query.where(PlanEntry.department == department)
    capex_filter = _normalize_capex_opex(capex_opex)
    if capex_filter:
        query = query.where(func.lower(BudgetItem.map_category) == capex_filter)
    rows = session.exec(query).all()
    if len(rows) > 1:
        return {
            "planned_amount": None,
            "ambiguous": True,
            "message": "Bu kalem için birden fazla plan kaydı bulunduğu için planlanan bütçe net belirlenemedi.",
        }
    if not rows:
        return {"planned_amount": None, "ambiguous": False, "message": None}
    return {"planned_amount": float(rows[0].amount or 0), "ambiguous": False, "message": None}


@router.get("/export/xlsx")
def export_expenses_xlsx(
    year: int = Query(...),
    scenario_id: int | None = Query(default=None),
    budget_item_id: int | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    capex_opex: str | None = Query(default=None),
    session: Session = Depends(get_db_session),
    _: User = Depends(get_current_user),
):
    query = (
        select(Expense, BudgetItem, Scenario)
        .join(BudgetItem, BudgetItem.id == Expense.budget_item_id)
        .outerjoin(Scenario, Scenario.id == Expense.scenario_id)
        .where(func.extract("year", Expense.expense_date) == year)
    )
    if scenario_id is not None:
        query = query.where(Expense.scenario_id == scenario_id)
    if budget_item_id is not None:
        query = query.where(Expense.budget_item_id == budget_item_id)
    if start_date is not None:
        query = query.where(Expense.expense_date >= start_date)
    if end_date is not None:
        query = query.where(Expense.expense_date <= end_date)
    capex_filter = _normalize_capex_opex(capex_opex)
    if capex_filter:
        query = query.where(func.lower(BudgetItem.map_category) == capex_filter)
    rows = session.exec(query.order_by(Expense.expense_date.desc())).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Expenses"
    ws.append(
        [
            "id",
            "expense_date",
            "scenario",
            "budget_code",
            "budget_name",
            "amount",
            "status",
            "vendor",
            "description",
        ]
    )
    for expense, budget_item, scenario in rows:
        ws.append(
            [
                expense.id,
                expense.expense_date.isoformat(),
                scenario.name if scenario else "",
                budget_item.code if budget_item else expense.budget_code,
                budget_item.name if budget_item else "",
                float(expense.amount or 0),
                expense.status.value if expense.status else "",
                expense.vendor or "",
                expense.description or "",
            ]
        )

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"expenses_{year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
