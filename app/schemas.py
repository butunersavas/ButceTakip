from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, validator

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


class PlanEntryRead(PlanEntryBase):
    id: int
    scenario: Optional["ScenarioRead"] = None
    budget_item: Optional["BudgetItemRead"] = None
    scenario_name: Optional[str] = None
    budget_item_name: Optional[str] = None
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
    scenario_id: Optional[int] = None
    expense_date: date
    amount: float
    quantity: float = 1
    unit_price: float = 0
    vendor: Optional[str] = None
    description: Optional[str] = None
    status: ExpenseStatus = ExpenseStatus.RECORDED
    is_out_of_budget: bool = False
    client_hostname: Optional[str] = None
    kaydi_giren_kullanici: Optional[str] = None

    @validator("amount", "quantity", "unit_price")
    def validate_non_negative(cls, value: float) -> float:
        if value < 0:
            raise ValueError("Value must be non-negative")
        return value


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
    is_out_of_budget: Optional[bool] = None
    client_hostname: Optional[str] = None
    kaydi_giren_kullanici: Optional[str] = None


class ExpenseRead(ExpenseBase):
    id: int
    created_by_id: Optional[int]
    updated_by_id: Optional[int] = None
    created_by_user_id: Optional[int] = None
    updated_by_user_id: Optional[int] = None
    created_by_name: Optional[str] = None
    updated_by_name: Optional[str] = None
    created_by_username: Optional[str] = None
    updated_by_username: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class WarrantyItemBase(BaseModel):
    type: WarrantyItemType
    name: str
    location: str
    end_date: date
    note: Optional[str] = None
    issuer: Optional[str] = None
    renewal_owner: Optional[str] = None
    reminder_days: Optional[int] = Field(default=30, ge=0)


class WarrantyItemCreate(WarrantyItemBase):
    pass


class WarrantyItemUpdate(BaseModel):
    type: Optional[WarrantyItemType] = None
    name: Optional[str] = None
    location: Optional[str] = None
    end_date: Optional[date] = None
    note: Optional[str] = None
    issuer: Optional[str] = None
    renewal_owner: Optional[str] = None
    reminder_days: Optional[int] = None
    is_active: Optional[bool] = None


class WarrantyItemRead(WarrantyItemBase):
    id: int
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
