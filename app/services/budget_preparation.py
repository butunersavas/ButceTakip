from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_DOWN

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import (
    BudgetItem,
    BudgetPreparation,
    BudgetPreparationAllocation,
    BudgetPreparationItem,
    PlanEntry,
    Scenario,
    User,
)
from app.schemas import (
    BudgetPreparationAllocationRead,
    BudgetPreparationItemInput,
    BudgetPreparationItemRead,
    BudgetPreparationRead,
    BudgetPreparationValidationError,
)

MONEY_STEP = Decimal("0.01")


def money(value: Decimal | float | int | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY_STEP)


def build_allocation_amounts(payload: BudgetPreparationItemInput) -> dict[int, Decimal]:
    total = money(payload.total_amount)
    if payload.distribution_method == "SINGLE_MONTH":
        if payload.single_month is None:
            return {}
        return {payload.single_month: total}

    if payload.distribution_method == "EQUAL":
        if payload.start_month is None or payload.month_count is None:
            return {}
        last_month = payload.start_month + payload.month_count - 1
        if last_month > 12:
            raise ValueError("Eşit dağıtım Aralık ayını aşamaz.")
        base = (total / payload.month_count).quantize(MONEY_STEP, rounding=ROUND_DOWN)
        amounts = {
            month: base
            for month in range(payload.start_month, last_month + 1)
        }
        amounts[last_month] = money(total - base * (payload.month_count - 1))
        return amounts

    amounts: dict[int, Decimal] = {}
    for allocation in payload.allocations:
        if allocation.month in amounts:
            raise ValueError(f"{allocation.month}. ay birden fazla kez gönderilemez.")
        amounts[allocation.month] = money(allocation.amount)
    return amounts


def replace_allocations(
    session: Session,
    item: BudgetPreparationItem,
    payload: BudgetPreparationItemInput,
) -> None:
    existing = session.exec(
        select(BudgetPreparationAllocation).where(
            BudgetPreparationAllocation.item_id == item.id
        )
    ).all()
    for allocation in existing:
        session.delete(allocation)
    session.flush()

    for month, amount in build_allocation_amounts(payload).items():
        session.add(
            BudgetPreparationAllocation(item_id=item.id, month=month, amount=amount)
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
        .order_by(BudgetPreparationAllocation.month)
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
        start_month=item.start_month,
        month_count=item.month_count,
        source_year=item.source_year,
        source_plan_id=item.source_plan_id,
        source_budget_item_id=item.source_budget_item_id,
        is_carryover=item.is_carryover,
        allocations=[
            BudgetPreparationAllocationRead(
                id=row.id, month=row.month, amount=money(row.amount)
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

        existing_item = session.exec(
            select(BudgetItem).where(
                func.upper(func.trim(BudgetItem.code)) == normalized_code
            )
        ).first()
        if existing_item and (
            existing_item.name.strip().casefold() != item.budget_name.strip().casefold()
            or (existing_item.map_category or "").strip().casefold()
            != (item.capex_opex or "").strip().casefold()
            or (existing_item.map_attribute or "").strip().casefold()
            != (item.map_attribute or "").strip().casefold()
        ):
            errors.append(
                BudgetPreparationValidationError(
                    item_id=item.id,
                    budget_code=item.budget_code,
                    field="budget_code",
                    message=(
                        "Bütçe kodu mevcut bir kalemle çakışıyor; ad, CAPEX/OPEX veya "
                        "Nitelik bilgisi aynı değil."
                    ),
                )
            )
    return errors


def activate_preparation(
    session: Session,
    preparation_id: int,
) -> tuple[BudgetPreparation, int, int]:
    preparation = session.exec(
        select(BudgetPreparation)
        .where(BudgetPreparation.id == preparation_id)
        .with_for_update()
    ).first()
    if not preparation:
        raise LookupError("Bütçe taslağı bulunamadı.")
    if preparation.status == "ACTIVE":
        return preparation, int(preparation.activated_scenario_id or 0), 0

    validation_errors = validate_preparation_for_completion(session, preparation)
    if validation_errors:
        error = ValueError("Bütçe tamamlanamadı")
        error.validation_errors = validation_errors  # type: ignore[attr-defined]
        raise error

    scenario = Scenario(
        name=preparation.name,
        year=preparation.year,
        description=preparation.note,
    )
    session.add(scenario)
    session.flush()

    created_plan_entries = 0
    items = session.exec(
        select(BudgetPreparationItem).where(
            BudgetPreparationItem.preparation_id == preparation.id
        )
    ).all()
    for item in items:
        normalized_code = item.budget_code.strip().upper()
        budget_item = session.exec(
            select(BudgetItem).where(
                func.upper(func.trim(BudgetItem.code)) == normalized_code
            )
        ).first()
        if budget_item is None:
            budget_item = BudgetItem(
                code=item.budget_code.strip(),
                name=item.budget_name.strip(),
                description=item.description,
                map_attribute=item.map_attribute,
                map_category=(item.capex_opex or "").lower(),
            )
            session.add(budget_item)
            session.flush()

        allocations = session.exec(
            select(BudgetPreparationAllocation)
            .where(BudgetPreparationAllocation.item_id == item.id)
            .order_by(BudgetPreparationAllocation.month)
        ).all()
        for allocation in allocations:
            if money(allocation.amount) <= 0:
                continue
            session.add(
                PlanEntry(
                    year=preparation.year,
                    month=allocation.month,
                    amount=float(money(allocation.amount)),
                    scenario_id=scenario.id,
                    budget_item_id=budget_item.id,
                    budget_code=budget_item.code,
                    department=item.department,
                )
            )
            created_plan_entries += 1

    preparation.status = "ACTIVE"
    preparation.activated_scenario_id = scenario.id
    preparation.completed_at = datetime.utcnow()
    preparation.updated_at = datetime.utcnow()
    session.add(preparation)
    session.commit()
    session.refresh(preparation)
    return preparation, scenario.id, created_plan_entries
