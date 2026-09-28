from __future__ import annotations

from collections import defaultdict
from decimal import Decimal, ROUND_DOWN

from sqlmodel import Session, select

from app.models import (
    BudgetPreparation,
    BudgetPreparationAllocation,
    BudgetPreparationItem,
    User,
)
from app.schemas import (
    BudgetPreparationAllocationRead,
    BudgetPreparationCarryoverRead,
    BudgetPreparationItemInput,
    BudgetPreparationItemRead,
    BudgetPreparationRead,
    BudgetPreparationValidationError,
    CarryoverMonthRead,
)

MONEY_STEP = Decimal("0.01")


def money(value: Decimal | float | int | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY_STEP)


def build_allocation_amounts(
    payload: BudgetPreparationItemInput,
    preparation_year: int = 2027,
) -> dict[tuple[int, int], Decimal]:
    total = money(payload.total_amount)
    start_year = payload.start_year or preparation_year
    if payload.distribution_method == "SINGLE_MONTH":
        if payload.single_month is None:
            return {}
        return {(start_year, payload.single_month): total}

    if payload.distribution_method == "EQUAL":
        if payload.start_month is None or payload.month_count is None:
            return {}
        base = (total / payload.month_count).quantize(MONEY_STEP, rounding=ROUND_DOWN)
        amounts: dict[tuple[int, int], Decimal] = {}
        for offset in range(payload.month_count):
            zero_based_month = payload.start_month - 1 + offset
            key = (start_year + zero_based_month // 12, zero_based_month % 12 + 1)
            amounts[key] = base
        last_key = next(reversed(amounts))
        amounts[last_key] = money(total - base * (payload.month_count - 1))
        return amounts

    amounts: dict[tuple[int, int], Decimal] = {}
    for allocation in payload.allocations:
        key = (allocation.year or preparation_year, allocation.month)
        if key in amounts:
            raise ValueError(f"{key[0]} / {key[1]}. ay birden fazla kez gönderilemez.")
        amounts[key] = money(allocation.amount)
    return amounts


def replace_allocations(
    session: Session,
    item: BudgetPreparationItem,
    payload: BudgetPreparationItemInput,
) -> None:
    preparation = session.get(BudgetPreparation, item.preparation_id)
    if not preparation:
        raise LookupError("Bütçe taslağı bulunamadı.")
    existing = session.exec(
        select(BudgetPreparationAllocation).where(
            BudgetPreparationAllocation.item_id == item.id
        )
    ).all()
    for allocation in existing:
        session.delete(allocation)
    session.flush()

    for (year, month), amount in build_allocation_amounts(payload, preparation.year).items():
        session.add(
            BudgetPreparationAllocation(item_id=item.id, year=year, month=month, amount=amount)
        )


def item_validation_errors(
    item: BudgetPreparationItem,
    allocations: list[BudgetPreparationAllocation],
) -> list[str]:
    errors: list[str] = []
    allocated = sum((money(row.amount) for row in allocations), Decimal("0.00"))
    total = money(item.total_amount)
    if total <= 0:
        errors.append("Toplam tutar sıfırdan büyük olmalıdır.")
    if (item.capex_opex or "").upper() not in {"CAPEX", "OPEX"}:
        errors.append("CAPEX/OPEX seçilmelidir.")
    if not (item.department or "").strip():
        errors.append("Departman seçilmelidir.")
    if not (item.map_attribute or "").strip():
        errors.append("Nitelik seçilmelidir.")
    if allocated != total:
        errors.append("Aylık dağılım toplamı bütçe kalemi toplamına eşit olmalıdır.")
    return errors


def build_item_read(session: Session, item: BudgetPreparationItem) -> BudgetPreparationItemRead:
    allocations = session.exec(
        select(BudgetPreparationAllocation)
        .where(BudgetPreparationAllocation.item_id == item.id)
        .order_by(BudgetPreparationAllocation.year, BudgetPreparationAllocation.month)
    ).all()
    allocated = sum((money(row.amount) for row in allocations), Decimal("0.00"))
    total = money(item.total_amount)
    errors = item_validation_errors(item, allocations)
    return BudgetPreparationItemRead(
        id=item.id,
        preparation_id=item.preparation_id,
        budget_name=item.budget_name,
        budget_code=item.budget_code,
        total_amount=total,
        currency=item.currency,
        capex_opex=item.capex_opex,
        department=item.department,
        map_attribute=item.map_attribute,
        description=item.description,
        distribution_method=item.distribution_method,
        single_month=item.single_month,
        start_year=item.start_year,
        start_month=item.start_month,
        month_count=item.month_count,
        source_year=item.source_year,
        source_plan_id=item.source_plan_id,
        source_budget_item_id=item.source_budget_item_id,
        is_carryover=item.is_carryover,
        allocations=[
            BudgetPreparationAllocationRead(
                id=row.id, year=row.year, month=row.month, amount=money(row.amount)
            )
            for row in allocations
        ],
        allocated_amount=allocated,
        remaining_amount=money(total - allocated),
        is_complete=not errors,
        validation_errors=errors,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def build_preparation_read(
    session: Session,
    preparation: BudgetPreparation,
    *,
    include_items: bool = True,
) -> BudgetPreparationRead:
    item_models = session.exec(
        select(BudgetPreparationItem)
        .where(BudgetPreparationItem.preparation_id == preparation.id)
        .order_by(BudgetPreparationItem.id)
    ).all()
    item_reads = [build_item_read(session, item) for item in item_models]
    creator = session.get(User, preparation.created_by_id) if preparation.created_by_id else None
    total = sum((item.total_amount for item in item_reads), Decimal("0.00"))
    capex_total = sum(
        (item.total_amount for item in item_reads if item.capex_opex == "CAPEX"),
        Decimal("0.00"),
    )
    opex_total = sum(
        (item.total_amount for item in item_reads if item.capex_opex == "OPEX"),
        Decimal("0.00"),
    )
    return BudgetPreparationRead(
        id=preparation.id,
        year=preparation.year,
        name=preparation.name,
        currency=preparation.currency,
        note=preparation.note,
        status=preparation.status,
        created_by_id=preparation.created_by_id,
        created_by_name=(creator.full_name or creator.username) if creator else None,
        activated_scenario_id=preparation.activated_scenario_id,
        # Historical records may still carry an activated_scenario_id.  The
        # preparation workspace no longer reads operational Scenario state.
        is_primary=False,
        completed_at=preparation.completed_at,
        created_at=preparation.created_at,
        updated_at=preparation.updated_at,
        item_count=len(item_reads),
        total_budget=money(total),
        incomplete_item_count=sum(not item.is_complete for item in item_reads),
        capex_total=money(capex_total),
        opex_total=money(opex_total),
        items=item_reads if include_items else [],
    )


def discover_carryovers(
    session: Session,
    target_year: int,
) -> list[BudgetPreparationCarryoverRead]:
    rows = session.exec(
        select(
            BudgetPreparationAllocation,
            BudgetPreparationItem,
            BudgetPreparation,
        )
        .join(
            BudgetPreparationItem,
            BudgetPreparationItem.id == BudgetPreparationAllocation.item_id,
        )
        .join(
            BudgetPreparation,
            BudgetPreparation.id == BudgetPreparationItem.preparation_id,
        )
        .where(BudgetPreparationAllocation.year == target_year)
        .where(BudgetPreparation.year < target_year)
        .where(BudgetPreparation.status.in_(("DRAFT", "READY", "ACTIVE")))
        .order_by(
            BudgetPreparation.year,
            BudgetPreparation.id,
            BudgetPreparationItem.id,
            BudgetPreparationAllocation.month,
        )
    ).all()
    grouped: dict[tuple[int, int, int, str], dict] = {}
    for allocation, item, preparation in rows:
        amount = money(allocation.amount)
        if amount <= 0:
            continue
        department = (item.department or "").strip()
        key = (preparation.id, item.id, target_year, department)
        entry = grouped.setdefault(
            key,
            {
                "source_year": preparation.year,
                "source_preparation_id": preparation.id,
                "source_scenario_id": None,
                "source_scenario_name": None,
                "source_preparation_name": preparation.name,
                "budget_item_id": item.source_budget_item_id,
                "budget_code": item.budget_code,
                "budget_name": item.budget_name,
                "department": item.department,
                "capex_opex": (item.capex_opex or "").upper() or None,
                "map_attribute": item.map_attribute,
                "months": defaultdict(lambda: Decimal("0.00")),
            },
        )
        entry["months"][allocation.month] += amount

    results: list[BudgetPreparationCarryoverRead] = []
    for entry in grouped.values():
        month_rows = [
            CarryoverMonthRead(month=month, amount=money(amount))
            for month, amount in sorted(entry.pop("months").items())
        ]
        results.append(
            BudgetPreparationCarryoverRead(
                **entry,
                months=month_rows,
                total_amount=money(sum((row.amount for row in month_rows), Decimal("0.00"))),
            )
        )
    return results


def validate_preparation_for_completion(
    session: Session,
    preparation: BudgetPreparation,
) -> list[BudgetPreparationValidationError]:
    errors: list[BudgetPreparationValidationError] = []
    if not preparation.name.strip():
        errors.append(
            BudgetPreparationValidationError(field="name", message="Bütçe adı zorunludur.")
        )
    if not preparation.year:
        errors.append(
            BudgetPreparationValidationError(field="year", message="Bütçe yılı zorunludur.")
        )

    items = session.exec(
        select(BudgetPreparationItem).where(
            BudgetPreparationItem.preparation_id == preparation.id
        )
    ).all()
    if not items:
        errors.append(
            BudgetPreparationValidationError(
                field="items", message="En az bir bütçe kalemi eklenmelidir."
            )
        )
        return errors

    seen_codes: set[str] = set()
    for item in items:
        normalized_code = item.budget_code.strip().upper()
        if normalized_code in seen_codes:
            errors.append(
                BudgetPreparationValidationError(
                    item_id=item.id,
                    budget_code=item.budget_code,
                    field="budget_code",
                    message="Aynı bütçe kodu taslakta birden fazla kez kullanılamaz.",
                )
            )
        seen_codes.add(normalized_code)

        allocations = session.exec(
            select(BudgetPreparationAllocation).where(
                BudgetPreparationAllocation.item_id == item.id
            )
        ).all()
        for message in item_validation_errors(item, allocations):
            field = (
                "total_amount"
                if message.startswith("Toplam")
                else "capex_opex"
                if message.startswith("CAPEX")
                else "department"
                if message.startswith("Departman")
                else "map_attribute"
                if message.startswith("Nitelik")
                else "allocations"
            )
            errors.append(
                BudgetPreparationValidationError(
                    item_id=item.id,
                    budget_code=item.budget_code,
                    field=field,
                    message=message,
                )
            )

    return errors


def validate_preparation_for_ready(
    session: Session,
    preparation: BudgetPreparation,
) -> list[BudgetPreparationValidationError]:
    """Validate preparation-owned data without consulting operational tables."""
    return validate_preparation_for_completion(session, preparation)
