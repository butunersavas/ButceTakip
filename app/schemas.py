from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal, Optional

from pydantic import BaseModel, Field, root_validator, validator
from sqlmodel import SQLModel

from app.models import ExpenseStatus, WarrantyItemType
from app.services.unused_reason import UNUSED_REASON_ALIASES

PLACEHOLDER_VALUES = {"-", "—"}
def _normalize_unused_reason(value: str | None, *, required: bool = False) -> str | None:
    normalized = _normalize_placeholder(value)
    if normalized is None:
        if required:
            raise ValueError("Kullanılmayacak sebebi seçiniz.")
        return None
    if normalized not in UNUSED_REASON_ALIASES:
        raise ValueError("Geçersiz kullanılmayacak sebebi.")
    return UNUSED_REASON_ALIASES[normalized]


def _normalize_placeholder(value: str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped or stripped in PLACEHOLDER_VALUES:
            return None
        return stripped
    return value


def _reject_placeholder(value: str | None, field: str) -> str | None:
    if value is None:
        return None
    if isinstance(value, str) and value.strip() in PLACEHOLDER_VALUES:
        raise ValueError(f"{field} is required")
    return value


def _parse_flexible_date(value: date | datetime | str | None, field_name: str) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        iso_candidate = raw[:10]
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
            try:
                candidate = iso_candidate if fmt == "%Y-%m-%d" else raw.replace("\\", "/")
                return datetime.strptime(candidate, fmt).date()
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(raw).date()
        except ValueError as exc:
            raise ValueError(f"{field_name} must be a valid date") from exc
    raise ValueError(f"Invalid {field_name}")


def _parse_decimal_value(value: Decimal | int | float | str | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        cleaned = raw.replace("\u00a0", " ")
        cleaned = cleaned.replace("TRY", "").replace("TL", "").replace("$", "")
        cleaned = cleaned.replace("USD", "").replace("EUR", "")
        cleaned = "".join(ch for ch in cleaned if ch.isdigit() or ch in ",.-")
        if not cleaned or cleaned in {"-", ".", ","}:
            return None
        if "," in cleaned and "." in cleaned:
            decimal_separator = "," if cleaned.rfind(",") > cleaned.rfind(".") else "."
            thousands_separator = "." if decimal_separator == "," else ","
            cleaned = cleaned.replace(thousands_separator, "")
            cleaned = cleaned.replace(decimal_separator, ".")
        elif "," in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        try:
            return Decimal(cleaned)
        except InvalidOperation as exc:
            raise ValueError("price must be a valid decimal") from exc
    raise ValueError("price must be a valid decimal")


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: int
    exp: int


class UserBase(BaseModel):
    username: str
    full_name: str | None = None
    is_active: bool = True
    is_admin: bool = False
    role: Literal["admin", "user", "viewer", "readonly", "read_only"] = "user"

    @validator("username")
    def normalize_username(cls, value: str) -> str:  # noqa: D417
        return value.strip().lower()

    @root_validator
    def normalize_role_flags(cls, values: dict) -> dict:  # noqa: D417
        is_admin = bool(values.get("is_admin"))
        role = values.get("role") or ("admin" if is_admin else "user")
        if role in {"readonly", "read_only"}:
            role = "viewer"
        if is_admin:
            values["role"] = "admin"
        elif role == "admin":
            values["is_admin"] = True
            values["role"] = "admin"
        else:
            values["role"] = role
        return values


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserRead(UserBase):
    id: int

    class Config:
        orm_mode = True


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    is_admin: bool | None = None
    role: Literal["admin", "user", "viewer", "readonly", "read_only"] | None = None
    password: str | None = None


class CurrentUserResponse(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    is_admin: bool
    role: Literal["admin", "user", "viewer"] = "user"
    is_active: bool = True

    class Config:
        orm_mode = True


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ScenarioBase(BaseModel):
    name: str
    year: int
    description: Optional[str] = None


class ScenarioCreate(ScenarioBase):
    pass


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    year: Optional[int] = None
    description: Optional[str] = None


class ScenarioRead(ScenarioBase):
    id: int

    class Config:
        orm_mode = True


class BudgetItemBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    map_attribute: Optional[str] = None
    map_category: Optional[str] = None

    @root_validator(pre=True)
    def normalize_map_aliases(cls, values: dict) -> dict:  # noqa: D417
        if not isinstance(values, dict):
            return values
        if "map_category" not in values:
            for key in ("category", "capex_opex", "capexOpex", "Capex/Opex", "Map Capex/Opex"):
                if key in values:
                    values["map_category"] = values.get(key)
                    break
        if "map_attribute" not in values:
            for key in ("attribute", "nitelik", "Nitelik", "Map Nitelik", "asset_type", "assetType"):
                if key in values:
                    values["map_attribute"] = values.get(key)
                    break
        return values

    @validator("code", "name", pre=True)
    def validate_required_text(cls, value: str | None, field) -> str:  # noqa: D417
        value = _reject_placeholder(value, field.name)
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValueError(f"{field.name} is required")
        return value.strip() if isinstance(value, str) else value

    @validator("description", "map_attribute", "map_category", pre=True)
    def normalize_optional_text(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)


class BudgetItemCreate(BudgetItemBase):
    pass


class BudgetItemUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    map_attribute: Optional[str] = None
    map_category: Optional[str] = None

    @root_validator(pre=True)
    def normalize_update_map_aliases(cls, values: dict) -> dict:  # noqa: D417
        if not isinstance(values, dict):
            return values
        if "map_category" not in values:
            for key in ("category", "capex_opex", "capexOpex", "Capex/Opex", "Map Capex/Opex"):
                if key in values:
                    values["map_category"] = values.get(key)
                    break
        if "map_attribute" not in values:
            for key in ("attribute", "nitelik", "Nitelik", "Map Nitelik", "asset_type", "assetType"):
                if key in values:
                    values["map_attribute"] = values.get(key)
                    break
        return values

    @validator("code", "name", pre=True)
    def validate_update_text(cls, value: str | None, field) -> str | None:  # noqa: D417
        value = _reject_placeholder(value, field.name)
        if value is None:
            return None
        return value.strip() if isinstance(value, str) else value

    @validator("description", "map_attribute", "map_category", pre=True)
    def normalize_update_optional_text(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)


class BudgetItemRead(BudgetItemBase):
    id: int

    class Config:
        orm_mode = True


class DeleteDependencyInfo(BaseModel):
    related_file_count: int = 0


class PlanEntryBase(BaseModel):
    year: int
    month: int
    amount: float
    scenario_id: int
    budget_item_id: int
    department: str | None = Field(default=None, max_length=100)

    @validator("month")
    def validate_month(cls, value: int) -> int:
        if not 1 <= value <= 12:
            raise ValueError("Month must be between 1 and 12")
        return value

    @validator("department", pre=True)
    def normalize_department(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)


class PlanEntryCreate(PlanEntryBase):
    pass


class BudgetPreparationBase(BaseModel):
    year: int
    name: str
    currency: str = "USD"
    note: str | None = None

    @validator("year")
    def validate_preparation_year(cls, value: int) -> int:
        if value < 2000 or value > 2200:
            raise ValueError("Bütçe yılı 2000 ile 2200 arasında olmalıdır.")
        return value

    @validator("name")
    def validate_preparation_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Bütçe adı zorunludur.")
        return normalized

    @validator("currency")
    def validate_preparation_currency(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized != "USD":
            raise ValueError("Bütçe para birimi USD olmalıdır.")
        return normalized

    @validator("note", pre=True)
    def normalize_preparation_note(cls, value: str | None) -> str | None:
        return _normalize_placeholder(value)


class BudgetPreparationCreate(BudgetPreparationBase):
    pass


class BudgetPreparationUpdate(BaseModel):
    year: int | None = None
    name: str | None = None
    currency: str | None = None
    note: str | None = None

    @validator("year")
    def validate_update_year(cls, value: int | None) -> int | None:
        if value is not None and not 2000 <= value <= 2200:
            raise ValueError("Bütçe yılı 2000 ile 2200 arasında olmalıdır.")
        return value

    @validator("name")
    def validate_update_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Bütçe adı zorunludur.")
        return normalized

    @validator("currency")
    def validate_update_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if normalized != "USD":
            raise ValueError("Bütçe para birimi USD olmalıdır.")
        return normalized

    @validator("note", pre=True)
    def normalize_update_note(cls, value: str | None) -> str | None:
        return _normalize_placeholder(value)


class BudgetPreparationAllocationInput(BaseModel):
    month: int
    amount: Decimal = Decimal("0.00")

    @validator("month")
    def validate_allocation_month(cls, value: int) -> int:
        if not 1 <= value <= 12:
            raise ValueError("Ay 1 ile 12 arasında olmalıdır.")
        return value

    @validator("amount")
    def validate_allocation_amount(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("Aylık dağılım negatif olamaz.")
        return value.quantize(Decimal("0.01"))


class BudgetPreparationItemInput(BaseModel):
    budget_name: str
    budget_code: str
    total_amount: Decimal = Decimal("0.00")
    currency: str = "USD"
    capex_opex: Literal["CAPEX", "OPEX"] | None = None
    department: str | None = None
    map_attribute: str | None = None
    description: str | None = None
    distribution_method: Literal["SINGLE_MONTH", "EQUAL", "CUSTOM"] = "CUSTOM"
    single_month: int | None = None
    start_month: int | None = None
    month_count: int | None = None
    allocations: list[BudgetPreparationAllocationInput] = Field(default_factory=list)
    source_year: int | None = None
    source_plan_id: int | None = None
    source_budget_item_id: int | None = None
    is_carryover: bool = False

    @validator("budget_name", "budget_code")
    def validate_item_required_text(cls, value: str, field) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError(f"{field.name} zorunludur.")
        return normalized

    @validator("total_amount")
    def validate_item_total(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("Toplam tutar negatif olamaz.")
        return value.quantize(Decimal("0.01"))

    @validator("currency")
    def validate_item_currency(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized != "USD":
            raise ValueError("Bütçe para birimi USD olmalıdır.")
        return normalized

    @validator("department", "map_attribute", "description", pre=True)
    def normalize_item_optional_text(cls, value: str | None) -> str | None:
        return _normalize_placeholder(value)

    @validator("single_month", "start_month")
    def validate_optional_month(cls, value: int | None) -> int | None:
        if value is not None and not 1 <= value <= 12:
            raise ValueError("Ay 1 ile 12 arasında olmalıdır.")
        return value

    @validator("month_count")
    def validate_month_count(cls, value: int | None) -> int | None:
        if value is not None and not 1 <= value <= 12:
            raise ValueError("Ay sayısı 1 ile 12 arasında olmalıdır.")
        return value


class BudgetPreparationAllocationRead(BudgetPreparationAllocationInput):
    id: int

    class Config:
        orm_mode = True


class BudgetPreparationItemRead(BaseModel):
    id: int
    preparation_id: int
    budget_name: str
    budget_code: str
    total_amount: Decimal
    currency: str
    capex_opex: str | None = None
    department: str | None = None
    map_attribute: str | None = None
    description: str | None = None
    distribution_method: str
    single_month: int | None = None
    start_month: int | None = None
    month_count: int | None = None
    source_year: int | None = None
    source_plan_id: int | None = None
    source_budget_item_id: int | None = None
    is_carryover: bool
    allocations: list[BudgetPreparationAllocationRead] = Field(default_factory=list)
    allocated_amount: Decimal = Decimal("0.00")
    remaining_amount: Decimal = Decimal("0.00")
    is_complete: bool = False
    validation_errors: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class BudgetPreparationRead(BaseModel):
    id: int
    year: int
    name: str
    currency: str
    note: str | None = None
    status: str
    created_by_id: int | None = None
    created_by_name: str | None = None
    activated_scenario_id: int | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    total_budget: Decimal = Decimal("0.00")
    incomplete_item_count: int = 0
    capex_total: Decimal = Decimal("0.00")
    opex_total: Decimal = Decimal("0.00")
    items: list[BudgetPreparationItemRead] = Field(default_factory=list)


class BudgetPreparationValidationError(BaseModel):
    item_id: int | None = None
    budget_code: str | None = None
    field: str
    message: str


class BudgetPreparationCompleteRead(BaseModel):
    preparation: BudgetPreparationRead
    scenario_id: int
    created_plan_entries: int


class BudgetPreparationMetadataRead(BaseModel):
    departments: list[str] = Field(default_factory=list)
    attributes: list[str] = Field(default_factory=list)


class PlanManualCreate(BaseModel):
    year: int
    month: int
    amount: float
    scenario_id: int
    budget_item_id: Optional[int] = None
    budget_code: Optional[str] = None
    budget_name: Optional[str] = None
    department: str | None = Field(default=None, max_length=100)
    map_category: Optional[str] = None
    map_attribute: Optional[str] = None
    description: Optional[str] = None
    merge_mode: str = "merge"

    @root_validator(pre=True)
    def normalize_manual_aliases(cls, values: dict) -> dict:  # noqa: D417
        if not isinstance(values, dict):
            return values
        if "map_category" not in values:
            for key in ("category", "capex_opex", "capexOpex", "Capex/Opex", "Map Capex/Opex"):
                if key in values:
                    values["map_category"] = values.get(key)
                    break
        if "map_attribute" not in values:
            for key in ("attribute", "nitelik", "Nitelik", "Map Nitelik", "asset_type", "assetType"):
                if key in values:
                    values["map_attribute"] = values.get(key)
                    break
        if "department" not in values:
            for key in ("departman", "Departman", "department_name", "departmentName"):
                if key in values:
                    values["department"] = values.get(key)
                    break
        return values

    @validator("month")
    def validate_month(cls, value: int) -> int:
        if not 1 <= value <= 12:
            raise ValueError("Month must be between 1 and 12")
        return value

    @validator("amount")
    def validate_positive_amount(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Amount must be greater than zero")
        return value

    @validator(
        "budget_code",
        "budget_name",
        "department",
        "map_category",
        "map_attribute",
        "description",
        pre=True,
    )
    def normalize_optional_text(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)

    @validator("merge_mode", pre=True)
    def normalize_merge_mode(cls, value: str | None) -> str:  # noqa: D417
        raw = (value or "merge").strip().lower()
        return raw if raw in {"merge", "separate"} else "merge"


class PlanEntryUpdate(BaseModel):
    year: Optional[int] = None
    month: Optional[int] = None
    amount: Optional[float] = None
    scenario_id: Optional[int] = None
    budget_item_id: Optional[int] = None
    department: str | None = Field(default=None, max_length=100)
    unused_reason: Optional[str] = None
    unused_note: Optional[str] = Field(default=None, max_length=500)

    @validator("department", pre=True)
    def normalize_update_department(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)

    @validator("unused_reason", pre=True)
    def normalize_update_unused_reason(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_unused_reason(value)

    @validator("unused_note", pre=True)
    def normalize_update_unused_note(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)


class PlanUnusedUpdate(BaseModel):
    amount: float
    reason: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)
    unused_updated_at: Optional[datetime] = None

    @validator("amount", pre=True)
    def normalize_amount(cls, value: float | str | None) -> float:  # noqa: D417
        if value is None:
            raise ValueError("Amount is required")
        if isinstance(value, (int, float)):
            parsed = float(value)
        else:
            raw = str(value).strip()
            if not raw:
                raise ValueError("Amount is required")
            if "," in raw and "." in raw:
                raw = raw.replace(".", "").replace(",", ".")
            else:
                raw = raw.replace(",", ".")
            try:
                parsed = float(raw)
            except ValueError as exc:
                raise ValueError("Amount must be a number") from exc
        if parsed <= 0:
            raise ValueError("Amount must be greater than zero")
        return parsed

    @validator("reason", pre=True)
    def normalize_reason(cls, value: str | None) -> str:
        return _normalize_unused_reason(value, required=True)

    @validator("note", pre=True)
    def normalize_unused_text(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)


class PlanUnusedApply(BaseModel):
    mode: Literal["current_month", "all_remaining", "custom", "reason_only"]
    amount: Optional[float] = None
    reason: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)

    @validator("reason", pre=True, always=True)
    def normalize_required_reason(cls, value: str | None) -> str:
        return _normalize_unused_reason(value, required=True)

    @validator("amount", pre=True)
    def normalize_optional_amount(cls, value: float | str | None) -> float | None:
        if value is None or value == "":
            return None
        try:
            parsed = float(str(value).replace(",", "."))
        except ValueError as exc:
            raise ValueError("Amount must be a number") from exc
        return parsed


class PlanUnusedOptionsRead(BaseModel):
    plan_id: int
    budget_name: Optional[str] = None
    total_budget: float
    spent_amount: float
    unused_amount: float
    current_month_available: float
    total_remaining_available: float
    unused_reason: Optional[str] = None
    unused_note: Optional[str] = None


class PlanEntryRead(SQLModel, table=False):
    id: int
    year: int
    month: int
    amount: float
    scenario_id: int
    budget_item_id: int
    department: Optional[str] = None
    department_name: Optional[str] = None
    scenario_name: Optional[str] = None
    budget_code: Optional[str] = None
    budget_name: Optional[str] = None
    capex_opex: Optional[str] = None
    asset_type: Optional[str] = None
    map_capex_opex: Optional[str] = None
    map_nitelik: Optional[str] = None
    nitelik: Optional[str] = None
    transfer_in_amount: float = 0
    transfer_out_amount: float = 0
    revised_amount: float = 0
    actual_amount: float = 0
    unused_amount: float = 0
    available_amount: float = 0
    scope_revised_amount: float = 0
    scope_actual_amount: float = 0
    scope_unused_amount: float = 0
    scope_cancelled_amount: float = 0
    scope_available_amount: float = 0
    cancelled_amount: float = 0
    is_cancelled: bool = False
    unused_reason: Optional[str] = None
    unused_note: Optional[str] = None
    unused_updated_at: datetime | None = None
    is_form_prepared: bool = False
    purchase_requested: bool = False
    purchase_requested_at: datetime | None = None
    purchase_requested_by: str | None = None

    class Config:
        orm_mode = True


class PlanAggregateRead(BaseModel):
    budget_item_id: int
    month: int
    total_amount: float
    original_amount: float = 0
    transfer_in_amount: float = 0
    transfer_out_amount: float = 0
    unused_amount: float = 0
    scenario_id: Optional[int] = None
    budget_code: Optional[str] = None
    budget_name: Optional[str] = None
    department: Optional[str] = None
    department_name: Optional[str] = None
    capex_opex: Optional[str] = None
    asset_type: Optional[str] = None
    map_capex_opex: Optional[str] = None
    map_nitelik: Optional[str] = None
    nitelik: Optional[str] = None


class BudgetTransferCreate(BaseModel):
    source_budget_item_id: int
    source_year: int
    source_month: int
    source_scenario_id: int
    target_budget_item_id: int
    target_year: int
    target_month: int
    target_scenario_id: int
    amount: float
    reason: str

    @validator("source_month", "target_month")
    def validate_transfer_month(cls, value: int) -> int:
        if not 1 <= value <= 12:
            raise ValueError("Month must be between 1 and 12")
        return value

    @validator("amount")
    def validate_transfer_amount(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Amount must be greater than zero")
        return value

    @validator("reason")
    def validate_transfer_reason(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Reason is required")
        return value.strip()


class BudgetTransferRead(BaseModel):
    id: int
    source_budget_item_id: int
    source_year: int
    source_month: int
    source_scenario_id: int
    target_budget_item_id: int
    target_year: int
    target_month: int
    target_scenario_id: int
    amount: float
    reason: str
    created_by_id: Optional[int] = None
    created_at: datetime
    is_cancelled: bool = False
    source_budget_name: Optional[str] = None
    target_budget_name: Optional[str] = None

    class Config:
        orm_mode = True


class BudgetAvailableRead(BaseModel):
    revised_amount: float
    actual_amount: float
    unused_amount: float = 0
    available_amount: float


class PurchaseReminder(BaseModel):
    budget_item_id: int
    budget_code: str
    budget_name: str
    year: int
    month: int
    scenario_id: int | None = None
    department: str | None = None
    is_form_prepared: bool = False


class PurchaseReminderUpdate(BaseModel):
    budget_code: str
    year: int
    month: int
    scenario_id: int
    department: str | None = None
    is_form_prepared: bool


class PurchaseFormPreparedReportItem(BaseModel):
    budget_item_id: int
    budget_code: str
    budget_name: str
    year: int
    month: int
    scenario_id: int | None = None
    department: str | None = None


class DashboardPurchaseAlertItem(BaseModel):
    id: int
    title: str
    department: str | None = None
    amount: float
    currency: str = "TRY"
    vendor: str | None = None
    requested: bool = False
    requested_at: datetime | None = None


class DashboardPurchaseAlertResponse(BaseModel):
    year: int
    month: int
    total: int
    pending: int
    done: int
    items: list[DashboardPurchaseAlertItem]


class PurchasePendingItem(BaseModel):
    id: int
    budget_item_id: int
    scenario_id: int
    year: int
    month: int
    department: str | None = None
    budget_code: str | None = None
    budget_name: str | None = None
    title: str
    capex_opex: str | None = None
    nitelik: str | None = None
    planned_amount: float
    actual_amount: float = 0
    remaining_amount: float = 0
    requested: bool = False
    status: str
    requested_at: datetime | None = None
    requested_by: str | None = None


class PurchaseAlertSetRequest(BaseModel):
    requested: bool


class ExpenseBase(BaseModel):
    budget_item_id: Optional[int] = None
    scenario_id: int | None = Field(default=None, alias="scenario")
    expense_date: date = Field(alias="date")
    amount: float | None = None
    quantity: float = 1
    unit_price: float = 0
    vendor: Optional[str] = None
    description: Optional[str] = None
    status: ExpenseStatus = ExpenseStatus.RECORDED
    is_out_of_budget: bool = Field(default=False, alias="out_of_budget")
    budget_outside_title: Optional[str] = None
    budget_outside_department: Optional[str] = None
    budget_outside_capex_opex: Optional[str] = None
    budget_outside_asset_type: Optional[str] = None
    mark_plan_purchased: bool = True
    allocation_mode: str = "single"
    allocation_start_month: Optional[int] = None
    allocation_month_count: Optional[int] = None
    allocation_method: Optional[str] = None
    client_hostname: Optional[str] = None
    kaydi_giren_kullanici: Optional[str] = None

    @validator("expense_date", pre=True)
    def parse_expense_date(cls, value: date | str) -> date:  # noqa: D417
        if isinstance(value, date):
            return value
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                raise ValueError("expense_date is required")
            try:
                return datetime.strptime(raw, "%Y-%m-%d").date()
            except ValueError:
                pass
            try:
                return datetime.strptime(raw, "%d.%m.%Y").date()
            except ValueError as exc:
                raise ValueError("expense_date must be YYYY-MM-DD or DD.MM.YYYY") from exc
        raise ValueError("Invalid expense_date")

    @validator("amount", "quantity", "unit_price", pre=True)
    def validate_non_negative(cls, value: float | str | None) -> float | None:
        if value is None:
            return value
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return None
            if "," in raw and "." in raw:
                raw = raw.replace(".", "").replace(",", ".")
            else:
                raw = raw.replace(",", ".")
            try:
                value = float(raw)
            except ValueError as exc:
                raise ValueError("Value must be a number") from exc
        if value < 0:
            raise ValueError("Value must be non-negative")
        return value

    @validator(
        "vendor",
        "description",
        "client_hostname",
        "kaydi_giren_kullanici",
        "budget_outside_title",
        "budget_outside_department",
        "budget_outside_capex_opex",
        "budget_outside_asset_type",
        pre=True,
    )
    def normalize_expense_text(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)

    @root_validator
    def validate_budget_binding(cls, values: dict) -> dict:
        if values.get("is_out_of_budget"):
            if not values.get("budget_outside_title"):
                raise ValueError("budget_outside_title is required for out-of-budget expenses")
            values["budget_item_id"] = None
            values["mark_plan_purchased"] = False
            values["allocation_mode"] = "single"
            values["allocation_start_month"] = None
            values["allocation_month_count"] = None
            values["allocation_method"] = None
            return values
        if not values.get("budget_item_id"):
            raise ValueError("budget_item_id is required")
        return values

    class Config:
        allow_population_by_field_name = True


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUnusedBudgetCreate(BaseModel):
    budget_item_id: int
    scenario_id: int | None = Field(default=None, alias="scenario")
    expense_date: date = Field(alias="date")
    amount: float
    reason: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)

    @validator("expense_date", pre=True)
    def parse_unused_expense_date(cls, value: date | str) -> date:  # noqa: D417
        if isinstance(value, date):
            return value
        if isinstance(value, str):
            parsed = value.strip()
            if not parsed:
                raise ValueError("Date is required")
            try:
                return date.fromisoformat(parsed[:10])
            except ValueError as exc:
                raise ValueError("Date must be in YYYY-MM-DD format") from exc
        raise ValueError("Date must be in YYYY-MM-DD format")

    @validator("amount", pre=True)
    def validate_unused_amount(cls, value: float | str | None) -> float:
        if value is None:
            raise ValueError("Amount must be greater than zero")
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                raise ValueError("Amount must be greater than zero")
            if "," in raw and "." in raw:
                raw = raw.replace(".", "").replace(",", ".")
            else:
                raw = raw.replace(",", ".")
            try:
                value = float(raw)
            except ValueError as exc:
                raise ValueError("Value must be a number") from exc
        if value <= 0:
            raise ValueError("Amount must be greater than zero")
        return value

    @validator("reason", pre=True, always=True)
    def normalize_unused_reason(cls, value: str | None) -> str:
        return _normalize_unused_reason(value, required=True)

    @validator("note", pre=True)
    def normalize_unused_text(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)

    class Config:
        allow_population_by_field_name = True


class PendingExpenseItem(BaseModel):
    plan_id: int
    budget_item_id: int
    scenario_id: int
    year: int
    month: int
    department: Optional[str] = None
    budget_code: Optional[str] = None
    budget_item: str
    capex_opex: Optional[str] = None
    nitelik: Optional[str] = None
    planned_amount: float
    expense_total: float
    remaining_amount: float
    unused_amount: float = 0
    pending_step: str
    pending_step_label: str
    pending_reason: str
    pending_reason_label: str
    pending_actions: list[str] = Field(default_factory=list)
    pending_action_labels: list[str] = Field(default_factory=list)
    purchase_request_pending: bool = False
    purchase_request_created: bool = False
    expense_missing: bool = False
    invoice_missing: bool
    missing_invoice_expense_id: Optional[int] = None
    description: Optional[str] = None


class PendingExpenseResponse(BaseModel):
    items: list[PendingExpenseItem]
    total: int


class PendingBudgetActionCounts(BaseModel):
    all: int = 0
    request_pending: int = 0
    expense_pending: int = 0
    invoice_pending: int = 0


class PendingBudgetActionResponse(PendingExpenseResponse):
    counts: PendingBudgetActionCounts


class ExpenseUpdate(BaseModel):
    budget_item_id: Optional[int] = None
    scenario_id: Optional[int] = None
    expense_date: Optional[date] = None
    amount: Optional[float] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ExpenseStatus] = None
    status: Optional[ExpenseStatus] = None
    is_out_of_budget: Optional[bool] = None
    budget_outside_title: Optional[str] = None
    budget_outside_department: Optional[str] = None
    budget_outside_capex_opex: Optional[str] = None
    budget_outside_asset_type: Optional[str] = None
    mark_plan_purchased: Optional[bool] = None
    allocation_mode: Optional[str] = None
    allocation_start_month: Optional[int] = None
    allocation_month_count: Optional[int] = None
    allocation_method: Optional[str] = None
    client_hostname: Optional[str] = None
    kaydi_giren_kullanici: Optional[str] = None

    @validator("expense_date", pre=True)
    def parse_expense_date(cls, value: date | str | None) -> date | None:  # noqa: D417
        if value is None:
            return None
        if isinstance(value, date):
            return value
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return None
            try:
                return datetime.strptime(raw, "%Y-%m-%d").date()
            except ValueError:
                pass
            try:
                return datetime.strptime(raw, "%d.%m.%Y").date()
            except ValueError as exc:
                raise ValueError("expense_date must be YYYY-MM-DD or DD.MM.YYYY") from exc
        raise ValueError("Invalid expense_date")

    @validator(
        "vendor",
        "description",
        "client_hostname",
        "kaydi_giren_kullanici",
        "budget_outside_title",
        "budget_outside_department",
        "budget_outside_capex_opex",
        "budget_outside_asset_type",
        pre=True,
    )
    def normalize_update_expense_text(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)

    @validator("amount", "quantity", "unit_price", pre=True)
    def normalize_numeric_fields(cls, value: float | str | None) -> float | None:  # noqa: D417
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        raw = str(value).strip()
        if not raw:
            return None
        if "," in raw and "." in raw:
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", ".")
        try:
            parsed = float(raw)
        except ValueError as exc:
            raise ValueError("Value must be a number") from exc
        if parsed < 0:
            raise ValueError("Value must be non-negative")
        return parsed


class ExpenseAllocationRead(BaseModel):
    year: int
    month: int
    allocated_amount: float
    plan_amount: Optional[float] = None
    actual_amount: Optional[float] = None
    unused_amount: Optional[float] = None
    available_amount: Optional[float] = None
    saving_amount: Optional[float] = None
    scope_plan_amount: Optional[float] = None
    scope_actual_amount: Optional[float] = None
    scope_unused_amount: Optional[float] = None
    scope_remaining_amount: Optional[float] = None
    scope_saving_amount: Optional[float] = None
    scope_overrun_amount: Optional[float] = None

    class Config:
        orm_mode = True


class ExpenseRead(SQLModel, table=False):
    id: int
    scenario_id: Optional[int] = None
    budget_item_id: Optional[int] = None
    budget_code: Optional[str] = None
    budget_outside_title: Optional[str] = None
    budget_outside_department: Optional[str] = None
    budget_outside_capex_opex: Optional[str] = None
    budget_outside_asset_type: Optional[str] = None
    expense_date: Optional[date] = Field(default=None, alias="date")
    amount: Optional[float] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ExpenseStatus] = None
    is_out_of_budget: Optional[bool] = Field(default=None, alias="out_of_budget")
    is_cancelled: Optional[bool] = None
    plan_amount: Optional[float] = None
    actual_amount: Optional[float] = None
    saving_amount: Optional[float] = None
    unused_amount: Optional[float] = None
    available_amount: Optional[float] = None
    scope_plan_amount: Optional[float] = None
    scope_actual_amount: Optional[float] = None
    scope_unused_amount: Optional[float] = None
    scope_remaining_amount: Optional[float] = None
    scope_saving_amount: Optional[float] = None
    scope_overrun_amount: Optional[float] = None
    attachment_count: int = 0
    has_attachment: bool = False
    allocation_count: int = 0
    allocations: list[ExpenseAllocationRead] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    scenario_name: Optional[str] = None
    budget_name: Optional[str] = None
    department: Optional[str] = None
    capex_opex: Optional[str] = None
    asset_type: Optional[str] = None
    map_capex_opex: Optional[str] = None
    map_nitelik: Optional[str] = None
    nitelik: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_by_name: Optional[str] = None
    created_by_username: Optional[str] = None
    updated_by_username: Optional[str] = None

    class Config:
        orm_mode = True
        allow_population_by_field_name = True


class ExpenseAttachmentRead(BaseModel):
    id: int
    expense_id: int
    file_name: str
    content_type: str
    size_bytes: int
    created_at: Optional[datetime] = None

    class Config:
        orm_mode = True


class WarrantyItemBase(BaseModel):
    type: WarrantyItemType
    name: str
    location: Optional[str] = None
    domain: Optional[str] = None
    end_date: Optional[date] = Field(default=None, alias="endDate")
    note: Optional[str] = Field(default=None, alias="notes")
    issuer: Optional[str] = Field(default=None, alias="issuer")
    certificate_issuer: Optional[str] = Field(default=None, alias="certificateIssuer")
    renewal_owner: Optional[str] = Field(default=None, alias="renewal_owner")
    renewal_responsible: Optional[str] = Field(default=None, alias="renewalResponsible")
    purchased_from: Optional[str] = Field(default=None, alias="purchasedFrom")
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = Field(default=None, alias="serialNumber")
    asset_tag: Optional[str] = Field(default=None, alias="assetTag")
    service_code: Optional[str] = Field(default=None, alias="serviceCode")
    ordered_product_model: Optional[str] = Field(default=None, alias="orderedProductModel")
    price: Optional[Decimal] = None
    shipment_date: Optional[date] = Field(default=None, alias="shipmentDate")
    end_of_service_life: Optional[date] = Field(default=None, alias="endOfServiceLife")
    status: Optional[str] = None
    reminder_days: Optional[int] = Field(default=30, ge=0)
    remind_days: Optional[int] = Field(default=30, ge=0)
    remind_days_before: Optional[int] = Field(default=30, ge=0)

    @validator("name", pre=True)
    def validate_required_warranty_text(cls, value: str | None, field) -> str:  # noqa: D417
        value = _reject_placeholder(value, field.name)
        if value is None or (isinstance(value, str) and not value.strip()):
            raise ValueError(f"{field.name} is required")
        return value.strip() if isinstance(value, str) else value

    @validator(
        "location",
        "domain",
        "note",
        "issuer",
        "certificate_issuer",
        "renewal_owner",
        "renewal_responsible",
        "purchased_from",
        "brand",
        "model",
        "serial_number",
        "asset_tag",
        "service_code",
        "ordered_product_model",
        "status",
        pre=True,
    )
    def normalize_warranty_text(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)

    @validator("price", pre=True)
    def parse_price(cls, value: Decimal | int | float | str | None) -> Decimal | None:  # noqa: D417
        return _parse_decimal_value(value)

    @root_validator(pre=True)
    def normalize_warranty_aliases(cls, values: dict) -> dict:  # noqa: D417
        if not isinstance(values, dict):
            return values
        if "notes" in values and "note" not in values:
            values["note"] = values.get("notes")
        if "certificateIssuer" in values and "certificate_issuer" not in values:
            values["certificate_issuer"] = values.get("certificateIssuer")
        if "issuer" in values and "certificate_issuer" not in values:
            values.setdefault("certificate_issuer", values.get("issuer"))
        if "renewalResponsible" in values and "renewal_responsible" not in values:
            values["renewal_responsible"] = values.get("renewalResponsible")
        if "renewalOwner" in values and "renewal_owner" not in values:
            values["renewal_owner"] = values.get("renewalOwner")
        if "renewalOwner" in values and "renewal_responsible" not in values:
            values["renewal_responsible"] = values.get("renewalOwner")
        if "renewal_owner" in values and "renewal_responsible" not in values:
            values.setdefault("renewal_responsible", values.get("renewal_owner"))
        if "renewal_owner" not in values and "renewal_responsible" in values:
            values["renewal_owner"] = values.get("renewal_responsible")
        if "endDate" in values and "end_date" not in values:
            values["end_date"] = values.get("endDate")
        if "expiration_date" in values and "end_date" not in values:
            values["end_date"] = values.get("expiration_date")
        if "purchasedFrom" in values and "purchased_from" not in values:
            values["purchased_from"] = values.get("purchasedFrom")
        if "serialNumber" in values and "serial_number" not in values:
            values["serial_number"] = values.get("serialNumber")
        if "assetTag" in values and "asset_tag" not in values:
            values["asset_tag"] = values.get("assetTag")
        if "serviceCode" in values and "service_code" not in values:
            values["service_code"] = values.get("serviceCode")
        if "orderedProductModel" in values and "ordered_product_model" not in values:
            values["ordered_product_model"] = values.get("orderedProductModel")
        if "shipmentDate" in values and "shipment_date" not in values:
            values["shipment_date"] = values.get("shipmentDate")
        if "endOfServiceLife" in values and "end_of_service_life" not in values:
            values["end_of_service_life"] = values.get("endOfServiceLife")
        if "support_end_date" in values and "end_date" not in values:
            values["end_date"] = values.get("support_end_date")
        return values

    @validator("end_date", "shipment_date", "end_of_service_life", pre=True)
    def parse_warranty_dates(cls, value: date | datetime | str | None, field) -> date | None:  # noqa: D417
        return _parse_flexible_date(value, field.name)


class WarrantyItemCreate(WarrantyItemBase):
    class Config:
        allow_population_by_field_name = True


class WarrantyItemUpdate(BaseModel):
    type: Optional[WarrantyItemType] = None
    name: Optional[str] = None
    location: Optional[str] = None
    domain: Optional[str] = None
    end_date: Optional[date] = Field(default=None, alias="endDate")
    note: Optional[str] = Field(default=None, alias="notes")
    issuer: Optional[str] = Field(default=None, alias="issuer")
    certificate_issuer: Optional[str] = Field(default=None, alias="certificateIssuer")
    renewal_owner: Optional[str] = Field(default=None, alias="renewal_owner")
    renewal_responsible: Optional[str] = Field(default=None, alias="renewalResponsible")
    purchased_from: Optional[str] = Field(default=None, alias="purchasedFrom")
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = Field(default=None, alias="serialNumber")
    asset_tag: Optional[str] = Field(default=None, alias="assetTag")
    service_code: Optional[str] = Field(default=None, alias="serviceCode")
    ordered_product_model: Optional[str] = Field(default=None, alias="orderedProductModel")
    price: Optional[Decimal] = None
    shipment_date: Optional[date] = Field(default=None, alias="shipmentDate")
    end_of_service_life: Optional[date] = Field(default=None, alias="endOfServiceLife")
    status: Optional[str] = None
    reminder_days: Optional[int] = None
    remind_days: Optional[int] = None
    remind_days_before: Optional[int] = None
    is_active: Optional[bool] = None

    @validator("name", "location", pre=True)
    def validate_update_warranty_text(cls, value: str | None, field) -> str | None:  # noqa: D417
        value = _reject_placeholder(value, field.name)
        if value is None:
            return None
        return value.strip() if isinstance(value, str) else value

    @validator(
        "domain",
        "note",
        "issuer",
        "certificate_issuer",
        "renewal_owner",
        "renewal_responsible",
        "purchased_from",
        "brand",
        "model",
        "serial_number",
        "asset_tag",
        "service_code",
        "ordered_product_model",
        "status",
        pre=True,
    )
    def normalize_update_warranty_text(cls, value: str | None) -> str | None:  # noqa: D417
        return _normalize_placeholder(value)

    @validator("price", pre=True)
    def parse_price(cls, value: Decimal | int | float | str | None) -> Decimal | None:  # noqa: D417
        return _parse_decimal_value(value)

    @root_validator(pre=True)
    def normalize_warranty_aliases(cls, values: dict) -> dict:  # noqa: D417
        if not isinstance(values, dict):
            return values
        if "notes" in values and "note" not in values:
            values["note"] = values.get("notes")
        if "certificateIssuer" in values and "certificate_issuer" not in values:
            values["certificate_issuer"] = values.get("certificateIssuer")
        if "issuer" in values and "certificate_issuer" not in values:
            values.setdefault("certificate_issuer", values.get("issuer"))
        if "renewalResponsible" in values and "renewal_responsible" not in values:
            values["renewal_responsible"] = values.get("renewalResponsible")
        if "renewalOwner" in values and "renewal_owner" not in values:
            values["renewal_owner"] = values.get("renewalOwner")
        if "renewalOwner" in values and "renewal_responsible" not in values:
            values["renewal_responsible"] = values.get("renewalOwner")
        if "renewal_owner" in values and "renewal_responsible" not in values:
            values.setdefault("renewal_responsible", values.get("renewal_owner"))
        if "renewal_owner" not in values and "renewal_responsible" in values:
            values["renewal_owner"] = values.get("renewal_responsible")
        if "endDate" in values and "end_date" not in values:
            values["end_date"] = values.get("endDate")
        if "expiration_date" in values and "end_date" not in values:
            values["end_date"] = values.get("expiration_date")
        if "renewal_owner" not in values and "renewalResponsible" in values:
            values["renewal_owner"] = values.get("renewalResponsible")
        if "purchasedFrom" in values and "purchased_from" not in values:
            values["purchased_from"] = values.get("purchasedFrom")
        if "serialNumber" in values and "serial_number" not in values:
            values["serial_number"] = values.get("serialNumber")
        if "assetTag" in values and "asset_tag" not in values:
            values["asset_tag"] = values.get("assetTag")
        if "serviceCode" in values and "service_code" not in values:
            values["service_code"] = values.get("serviceCode")
        if "orderedProductModel" in values and "ordered_product_model" not in values:
            values["ordered_product_model"] = values.get("orderedProductModel")
        if "shipmentDate" in values and "shipment_date" not in values:
            values["shipment_date"] = values.get("shipmentDate")
        if "endOfServiceLife" in values and "end_of_service_life" not in values:
            values["end_of_service_life"] = values.get("endOfServiceLife")
        if "support_end_date" in values and "end_date" not in values:
            values["end_date"] = values.get("support_end_date")
        return values

    @validator("end_date", "shipment_date", "end_of_service_life", pre=True)
    def parse_warranty_dates(cls, value: date | datetime | str | None, field) -> date | None:  # noqa: D417
        return _parse_flexible_date(value, field.name)

    class Config:
        allow_population_by_field_name = True


class WarrantyItemRead(SQLModel, table=False):
    id: int
    type: WarrantyItemType
    name: str
    location: Optional[str] = None
    domain: Optional[str] = None
    end_date: Optional[date] = None
    note: Optional[str] = None
    issuer: Optional[str] = None
    certificate_issuer: Optional[str] = None
    renewal_owner: Optional[str] = None
    renewal_responsible: Optional[str] = None
    purchased_from: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    asset_tag: Optional[str] = None
    service_code: Optional[str] = None
    ordered_product_model: Optional[str] = None
    price: Optional[Decimal] = None
    shipment_date: Optional[date] = None
    end_of_service_life: Optional[date] = None
    reminder_days: Optional[int] = None
    remind_days: Optional[int] = None
    remind_days_before: Optional[int] = None
    is_active: bool
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_by_user_id: Optional[int] = None
    updated_by_user_id: Optional[int] = None
    created_by_name: Optional[str] = None
    updated_by_name: Optional[str] = None
    created_by_username: Optional[str] = None
    updated_by_username: Optional[str] = None
    days_left: Optional[int] = None
    status: Optional[str] = None
    computed_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class WarrantyItemCriticalRead(WarrantyItemRead):
    days_left: int


class DashboardSummary(BaseModel):
    month: int
    planned: float
    actual: float
    saving: float
    remaining: float = 0
    unused: float = 0
    cancelled: float = 0


class DashboardKPI(BaseModel):
    total_plan: float
    total_actual: float
    total_remaining: float
    total_saving: float
    total_overrun: float
    total_unused: float = 0
    total_negotiated_saving: float = 0
    total_other_saving: float = 0
    total_combined_saving: float = 0
    total_cancelled: float = 0
    realized_plan_inside_amount: float = 0
    capex_realized_plan_inside_amount: float = 0
    opex_realized_plan_inside_amount: float = 0
    unclassified_realized_plan_inside_amount: float = 0
    remaining_available_amount: float = 0
    capex_remaining_available_amount: float = 0
    opex_remaining_available_amount: float = 0
    unclassified_remaining_available_amount: float = 0
    negotiated_saving_amount: float = 0
    capex_negotiated_saving_amount: float = 0
    opex_negotiated_saving_amount: float = 0
    unclassified_negotiated_saving_amount: float = 0
    other_saving_amount: float = 0
    capex_other_saving_amount: float = 0
    opex_other_saving_amount: float = 0
    unclassified_other_saving_amount: float = 0
    canceled_budget_amount: float = 0
    capex_canceled_budget_amount: float = 0
    opex_canceled_budget_amount: float = 0
    unclassified_canceled_budget_amount: float = 0
    overrun_amount: float = 0
    capex_overrun_amount: float = 0
    opex_overrun_amount: float = 0
    unclassified_overrun_amount: float = 0
    budget_outside_amount: float = 0
    capex_budget_outside_amount: float = 0
    opex_budget_outside_amount: float = 0
    unclassified_budget_outside_amount: float = 0
    reconciliation_total: float = 0
    capex_reconciliation_total: float = 0
    opex_reconciliation_total: float = 0
    unclassified_reconciliation_total: float = 0
    reconciliation_difference: float = 0
    capex_reconciliation_difference: float = 0
    opex_reconciliation_difference: float = 0
    unclassified_reconciliation_difference: float = 0
    capex_total_plan_amount: float = 0
    opex_total_plan_amount: float = 0
    unclassified_total_plan_amount: float = 0


class BudgetReconciliationRead(BaseModel):
    total_plan_amount: float
    capex_total_plan_amount: float
    opex_total_plan_amount: float
    unclassified_total_plan_amount: float
    realized_plan_inside_amount: float
    capex_realized_plan_inside_amount: float
    opex_realized_plan_inside_amount: float
    unclassified_realized_plan_inside_amount: float
    remaining_available_amount: float
    capex_remaining_available_amount: float
    opex_remaining_available_amount: float
    unclassified_remaining_available_amount: float
    negotiated_saving_amount: float
    capex_negotiated_saving_amount: float
    opex_negotiated_saving_amount: float
    unclassified_negotiated_saving_amount: float
    other_saving_amount: float
    capex_other_saving_amount: float
    opex_other_saving_amount: float
    unclassified_other_saving_amount: float
    canceled_budget_amount: float
    capex_canceled_budget_amount: float
    opex_canceled_budget_amount: float
    unclassified_canceled_budget_amount: float
    overrun_amount: float
    capex_overrun_amount: float
    opex_overrun_amount: float
    unclassified_overrun_amount: float
    budget_outside_amount: float
    capex_budget_outside_amount: float
    opex_budget_outside_amount: float
    unclassified_budget_outside_amount: float
    reconciliation_total: float
    capex_reconciliation_total: float
    opex_reconciliation_total: float
    unclassified_reconciliation_total: float
    reconciliation_difference: float
    capex_reconciliation_difference: float
    opex_reconciliation_difference: float
    unclassified_reconciliation_difference: float


class DashboardResponse(BaseModel):
    kpi: DashboardKPI
    monthly: list[DashboardSummary]
    reconciliation: BudgetReconciliationRead | None = None


class OverBudgetSummary(BaseModel):
    over_total: float
    over_item_count: int
    total_revised_plan: float = 0
    total_actual: float = 0
    total_valid_actual: float = 0
    remaining_total: float = 0
    remaining_item_count: int = 0
    saving_total: float = 0
    saving_item_count: int = 0
    unused_total: float = 0
    unused_item_count: int = 0
    negotiated_saving_total: float = 0
    negotiated_saving_item_count: int = 0
    other_saving_total: float = 0
    other_saving_item_count: int = 0
    total_saving_total: float = 0
    total_saving_item_count: int = 0


class OverBudgetItem(BaseModel):
    budget_item_id: int
    budget_code: str
    budget_name: str
    months: list[int] = Field(default_factory=list)
    capex_opex: Optional[str] = None
    asset_type: Optional[str] = None
    department: Optional[str] = None
    plan: float
    actual: float
    over: float
    over_pct: float
    unused_amount: float = 0
    available_amount: float = 0
    reason: Optional[str] = None
    note: Optional[str] = None
    unused_updated_at: Optional[datetime] = None
    year: int
    month: int | None = None
    scenario: int | None = None


class OverBudgetResponse(BaseModel):
    summary: OverBudgetSummary
    items: list[OverBudgetItem]
    saving_items: list[OverBudgetItem] = Field(default_factory=list)
    remaining_items: list[OverBudgetItem] = Field(default_factory=list)
    unused_items: list[OverBudgetItem] = Field(default_factory=list)


class SpendMonthlySummary(BaseModel):
    month: int
    plan_total: float
    actual_total: float
    within_plan_total: float
    over_total: float
    remaining_total: float
    unused_total: float = 0


class SpendTrendMonth(BaseModel):
    month: int
    planned: float
    actual: float
    remaining: float
    overrun: float
    overrun_pct: float


class SpendTrendResponse(BaseModel):
    year: int
    scenario_id: int | None
    scope: str
    selected_budget_code: str | None
    months: list[SpendTrendMonth]


class RiskyItem(BaseModel):
    budget_item_id: int
    budget_code: str
    budget_name: str
    plan: float
    actual: float
    ratio: float


class NoSpendItem(BaseModel):
    budget_item_id: int
    budget_code: str
    budget_name: str
    plan: float


class ImportSummary(BaseModel):
    imported_plans: int = 0
    imported_expenses: int = 0
    skipped_rows: int = 0
    message: str | None = None


class CleanupRequest(BaseModel):
    budget_item_id: Optional[int] = None
    scenario_id: Optional[int] = None
    clear_imported_only: bool = False
    reset_plans: bool = False
