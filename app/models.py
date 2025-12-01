import enum
from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


class TimestampMixin(SQLModel):
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class ExpenseStatus(str, enum.Enum):
    RECORDED = "recorded"
    CANCELLED = "cancelled"


class User(TimestampMixin, SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, nullable=False)
    full_name: str = Field(nullable=False)
    hashed_password: str = Field(nullable=False)
    is_active: bool = Field(default=True, nullable=False)
    role: str = Field(default="user", nullable=False)

    expenses: list["Expense"] = Relationship(back_populates="created_by")


class Scenario(TimestampMixin, SQLModel, table=True):
    __tablename__ = "scenarios"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(nullable=False)
    year: int = Field(nullable=False, index=True)
    description: Optional[str] = Field(default=None)

    plans: list["PlanEntry"] = Relationship(back_populates="scenario")
    expenses: list["Expense"] = Relationship(back_populates="scenario")


class BudgetItem(TimestampMixin, SQLModel, table=True):
    __tablename__ = "budget_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(nullable=False, unique=True, index=True)
    name: str = Field(nullable=False)
    description: Optional[str] = Field(default=None)
    map_attribute: Optional[str] = Field(default=None, nullable=True)
    map_category: Optional[str] = Field(default=None, nullable=True)

    plans: list["PlanEntry"] = Relationship(back_populates="budget_item")
    expenses: list["Expense"] = Relationship(back_populates="budget_item")


class PlanEntry(TimestampMixin, SQLModel, table=True):
    __tablename__ = "plan_entries"

    id: Optional[int] = Field(default=None, primary_key=True)
    year: int = Field(nullable=False, index=True)
    month: int = Field(nullable=False, ge=1, le=12, index=True)
    amount: float = Field(default=0, nullable=False)
    scenario_id: int = Field(foreign_key="scenarios.id", nullable=False)
    budget_item_id: int = Field(foreign_key="budget_items.id", nullable=False)

    scenario: Scenario = Relationship(back_populates="plans")
    budget_item: BudgetItem = Relationship(back_populates="plans")


class Expense(TimestampMixin, SQLModel, table=True):
    __tablename__ = "expenses"

    id: Optional[int] = Field(default=None, primary_key=True)
    budget_item_id: int = Field(foreign_key="budget_items.id", nullable=False, index=True)
    scenario_id: Optional[int] = Field(default=None, foreign_key="scenarios.id")
    expense_date: date = Field(nullable=False, index=True)
    amount: float = Field(nullable=False)
    quantity: float = Field(default=1, nullable=False)
    unit_price: float = Field(default=0, nullable=False)
    vendor: Optional[str] = Field(default=None)
    description: Optional[str] = Field(default=None)
    status: ExpenseStatus = Field(default=ExpenseStatus.RECORDED, nullable=False)
    is_out_of_budget: bool = Field(default=False, nullable=False)
    created_by_id: Optional[int] = Field(default=None, foreign_key="users.id")
    client_hostname: Optional[str] = Field(default=None, nullable=True)

    budget_item: BudgetItem = Relationship(back_populates="expenses")
    scenario: Optional[Scenario] = Relationship(back_populates="expenses")
    created_by: Optional[User] = Relationship(back_populates="expenses")
