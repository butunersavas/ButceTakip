from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, validator

from app.models import ExpenseStatus


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: int
    exp: int


class UserBase(BaseModel):
    email: str
    full_name: str
    role: str = "user"


class UserCreate(UserBase):
    password: str = Field(min_length=8)


class UserRead(UserBase):
    id: int

    class Config:
        orm_mode = True


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


class BudgetItemCreate(BudgetItemBase):
    pass


class BudgetItemUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    map_attribute: Optional[str] = None


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


class PlanEntryRead(PlanEntryBase):
    id: int

    class Config:
        orm_mode = True


class PlanAggregateRead(BaseModel):
    budget_item_id: int
    month: int
    total_amount: float


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


class ExpenseRead(ExpenseBase):
    id: int
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


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
