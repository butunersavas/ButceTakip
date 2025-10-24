from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.dependencies import get_admin_user, get_current_user, get_db_session
from app.models import BudgetItem, User
from app.schemas import BudgetItemCreate, BudgetItemRead, BudgetItemUpdate

router = APIRouter(prefix="/budget-items", tags=["Budget Items"])


@router.get("/", response_model=list[BudgetItemRead])
def list_budget_items(
    session: Session = Depends(get_db_session), current_user: User = Depends(get_current_user)
) -> list[BudgetItem]:
    return session.exec(select(BudgetItem)).all()


@router.post("/", response_model=BudgetItemRead, status_code=status.HTTP_201_CREATED)
def create_budget_item(
    item_in: BudgetItemCreate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> BudgetItem:
    existing = session.exec(select(BudgetItem).where(BudgetItem.code == item_in.code)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code already exists")
    item = BudgetItem(**item_in.dict())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.put("/{item_id}", response_model=BudgetItemRead)
def update_budget_item(
    item_id: int,
    item_in: BudgetItemUpdate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> BudgetItem:
    item = session.get(BudgetItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget item not found")
    for field, value in item_in.dict(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget_item(
    item_id: int,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> None:
    item = session.get(BudgetItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget item not found")
    session.delete(item)
    session.commit()
