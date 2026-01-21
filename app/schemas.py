from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, root_validator, validator
from sqlmodel import SQLModel

from app.models import ExpenseStatus, WarrantyItemType


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

    @validator("username")
    def normalize_username(cls, value: str) -> str:  # noqa: D417
        return value.strip().lower()


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
    password: str | None = None


class CurrentUserResponse(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    is_admin: bool
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


class BudgetItemCreate(BudgetItemBase):
    pass


class BudgetItemUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    map_attribute: Optional[str] = None
    map_category: Optional[str] = None


class BudgetItemRead(BudgetItemBase):
    id: int

    class Config:
        orm_mode = True


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


class PlanEntryCreate(PlanEntryBase):
    pass


class PlanEntryUpdate(BaseModel):
    year: Optional[int] = None
    month: Optional[int] = None
    amount: Optional[float] = None
    scenario_id: Optional[int] = None
    budget_item_id: Optional[int] = None
    department: str | None = Field(default=None, max_length=100)


class PlanEntryRead(SQLModel, table=False):
    id: int
    year: int
    month: int
    amount: float
    scenario_id: int
    budget_item_id: int
    department: Optional[str] = None
    scenario_name: Optional[str] = None
    budget_code: Optional[str] = None
    budget_name: Optional[str] = None
    capex_opex: Optional[str] = None
    asset_type: Optional[str] = None

    class Config:
        orm_mode = True


class PlanAggregateRead(BaseModel):
    budget_item_id: int
    month: int
    total_amount: float


class PurchaseReminder(BaseModel):
    budget_item_id: int
    budget_code: str
    budget_name: str
    year: int
    month: int
    is_form_prepared: bool = False


class PurchaseReminderUpdate(BaseModel):
    budget_item_id: int
    year: int
    month: int
    is_form_prepared: bool


class PurchaseFormPreparedReportItem(BaseModel):
    budget_item_id: int
    budget_code: str
    budget_name: str
    year: int
    month: int
    scenario_id: int | None = None


class ExpenseBase(BaseModel):
    budget_item_id: int
    scenario_id: int | None = Field(default=None, alias="scenario")
    expense_date: date = Field(alias="date")
    amount: float | None = None
    quantity: float = 1
    unit_price: float = 0
    vendor: Optional[str] = None
    description: Optional[str] = None
    status: ExpenseStatus = ExpenseStatus.RECORDED
    is_out_of_budget: bool = Field(default=False, alias="out_of_budget")
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

    class Config:
        allow_population_by_field_name = True


class ExpenseCreate(ExpenseBase):
    pass


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


class ExpenseRead(SQLModel, table=False):
    id: int
    scenario_id: Optional[int] = None
    budget_item_id: int
    budget_code: Optional[str] = None
    expense_date: Optional[date] = Field(default=None, alias="date")
    amount: Optional[float] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    vendor: Optional[str] = None
    description: Optional[str] = None
    is_out_of_budget: Optional[bool] = Field(default=None, alias="out_of_budget")
    is_cancelled: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    scenario_name: Optional[str] = None
    budget_name: Optional[str] = None
    department: Optional[str] = None
    capex_opex: Optional[str] = None
    asset_type: Optional[str] = None
    created_by_name: Optional[str] = None
    updated_by_name: Optional[str] = None
    created_by_username: Optional[str] = None
    updated_by_username: Optional[str] = None

    class Config:
        orm_mode = True
        allow_population_by_field_name = True


class WarrantyItemBase(BaseModel):
    type: WarrantyItemType
    name: str
    location: str
    domain: Optional[str] = None
    end_date: Optional[date] = Field(default=None, alias="endDate")
    note: Optional[str] = Field(default=None, alias="notes")
    issuer: Optional[str] = Field(default=None, alias="issuer")
    certificate_issuer: Optional[str] = Field(default=None, alias="certificateIssuer")
    renewal_owner: Optional[str] = Field(default=None, alias="renewal_owner")
    renewal_responsible: Optional[str] = Field(default=None, alias="renewalResponsible")
    reminder_days: Optional[int] = Field(default=30, ge=0)
    remind_days: Optional[int] = Field(default=30, ge=0)
    remind_days_before: Optional[int] = Field(default=30, ge=0)

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
        if "renewal_owner" in values and "renewal_responsible" not in values:
            values.setdefault("renewal_responsible", values.get("renewal_owner"))
        if "renewal_owner" not in values and "renewal_responsible" in values:
            values["renewal_owner"] = values.get("renewal_responsible")
        if "endDate" in values and "end_date" not in values:
            values["end_date"] = values.get("endDate")
        if "expiration_date" in values and "end_date" not in values:
            values["end_date"] = values.get("expiration_date")
        return values

    @validator("end_date", pre=True)
    def parse_end_date(cls, value: date | str | None) -> date | None:  # noqa: D417
        if isinstance(value, date):
            return value
        if value is None:
            return None
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
                raise ValueError("end_date must be YYYY-MM-DD or DD.MM.YYYY") from exc
        raise ValueError("Invalid end_date")


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
    reminder_days: Optional[int] = None
    remind_days: Optional[int] = None
    remind_days_before: Optional[int] = None
    is_active: Optional[bool] = None

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
        return values

    @validator("end_date", pre=True)
    def parse_end_date(cls, value: date | str | None) -> date | None:  # noqa: D417
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
                raise ValueError("end_date must be YYYY-MM-DD or DD.MM.YYYY") from exc
        raise ValueError("Invalid end_date")

    class Config:
        allow_population_by_field_name = True


class WarrantyItemRead(SQLModel, table=False):
    id: int
    type: WarrantyItemType
    name: str
    location: str
    domain: Optional[str] = None
    end_date: Optional[date] = None
    note: Optional[str] = None
    issuer: Optional[str] = None
    certificate_issuer: Optional[str] = None
    renewal_owner: Optional[str] = None
    renewal_responsible: Optional[str] = None
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


class DashboardKPI(BaseModel):
    total_plan: float
    total_actual: float
    total_remaining: float
    total_saving: float
    total_overrun: float


class DashboardResponse(BaseModel):
    kpi: DashboardKPI
    monthly: list[DashboardSummary]


class OverBudgetSummary(BaseModel):
    over_total: float
    over_item_count: int


class OverBudgetItem(BaseModel):
    budget_code: str
    budget_name: str
    plan: float
    actual: float
    over: float
    over_pct: float


class OverBudgetResponse(BaseModel):
    summary: OverBudgetSummary
    items: list[OverBudgetItem]


class SpendMonthlySummary(BaseModel):
    month: int
    plan_total: float
    actual_total: float
    within_plan_total: float
    over_total: float
    remaining_total: float


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
