import enum
from datetime import date, datetime
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


class TimestampMixin(SQLModel):
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


class ExpenseStatus(str, enum.Enum):
    RECORDED = "recorded"
    CANCELLED = "cancelled"


class WarrantyItemType(str, enum.Enum):
    DEVICE = "DEVICE"
    SERVICE = "SERVICE"


class User(TimestampMixin, SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True, nullable=False)
    email: Optional[str] = Field(default=None, index=True, unique=True)
    full_name: Optional[str] = Field(default=None)
    hashed_password: str = Field(nullable=False)
    is_active: bool = Field(default=True, nullable=False)
    is_admin: bool = Field(default=False, nullable=False)

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
    department: Optional[str] = Field(default=None, max_length=100, nullable=True)

    scenario: Scenario = Relationship(back_populates="plans")
    budget_item: BudgetItem = Relationship(back_populates="plans")


class PurchaseFormStatus(SQLModel, table=True):
    __tablename__ = "purchase_form_status"
    __table_args__ = (
        UniqueConstraint("budget_item_id", "year", "month", name="uq_form_status_item_month"),
    )

    id: int | None = Field(default=None, primary_key=True)
    budget_item_id: int = Field(index=True)
    year: int
    month: int
    is_prepared: bool = Field(default=True)
    prepared_at: datetime | None = Field(default_factory=datetime.utcnow)


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
    kaydi_giren_kullanici: Optional[str] = Field(default=None, nullable=True)

    budget_item: BudgetItem = Relationship(back_populates="expenses")
    scenario: Optional[Scenario] = Relationship(back_populates="expenses")
    created_by: Optional[User] = Relationship(back_populates="expenses")


class WarrantyItem(TimestampMixin, SQLModel, table=True):
    __tablename__ = "warranty_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    type: WarrantyItemType = Field(nullable=False)
    name: str = Field(nullable=False)
    location: str = Field(nullable=False)
    end_date: date = Field(nullable=False)
    note: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True, nullable=False)
