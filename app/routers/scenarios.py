from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import Session, select

from app.dependencies import get_current_user, get_db_session
from app.models import BudgetItem, Expense, PlanEntry, PurchaseFormStatus, Scenario, User
from app.schemas import ScenarioCreate, ScenarioRead, ScenarioUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])


@router.get("/", response_model=list[ScenarioRead])
def list_scenarios(
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[Scenario]:
    """Tüm senaryoları listele (sadece oturum açmış kullanıcılar)."""
    return session.exec(select(Scenario).where(Scenario.year >= 0)).all()


@router.post("/", response_model=ScenarioRead, status_code=status.HTTP_201_CREATED)
def create_scenario(
    scenario_in: ScenarioCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Scenario:
    """Yeni senaryo oluştur (herhangi bir oturum açmış kullanıcı)."""
    scenario = Scenario(**scenario_in.dict())
    session.add(scenario)
    session.commit()
    session.refresh(scenario)
    return scenario


@router.put("/{scenario_id}", response_model=ScenarioRead)
def update_scenario(
    scenario_id: int,
    scenario_in: ScenarioUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Scenario:
    """Var olan senaryoyu güncelle (herhangi bir oturum açmış kullanıcı)."""
    scenario = session.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")

    for field, value in scenario_in.dict(exclude_unset=True).items():
        setattr(scenario, field, value)
    scenario.updated_at = datetime.utcnow()
    session.add(scenario)
    session.commit()
    session.refresh(scenario)
    return scenario


@router.delete("/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(
    scenario_id: int,
    force: bool = Query(False, description="İlişkili tüm verileri de silerek kaldır"),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Senaryoyu sil.

    - Sadece admin kullanıcılar silebilir.
    - force=True ve kullanıcı admin ise bağlı plan/harcama kayıtları da kaldırılır.
    """

    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için yetkiniz yok",
        )

    scenario = session.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")

    expense_count = session.exec(
        select(func.count(Expense.id)).where(Expense.scenario_id == scenario_id)
    ).one()
    plan_count = session.exec(
        select(func.count(PlanEntry.id)).where(PlanEntry.scenario_id == scenario_id)
    ).one()

    if (expense_count or plan_count) and not force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Bu senaryo mevcut kayıtlar tarafından kullanıldığı için silinemez.",
                "references": {"expenses": expense_count, "plans": plan_count},
            },
        )

    candidate_budget_item_ids: set[int] = set(
        session.exec(
            select(PlanEntry.budget_item_id).where(PlanEntry.scenario_id == scenario_id)
        ).all()
    )
    candidate_budget_item_ids.update(
        session.exec(
            select(Expense.budget_item_id).where(Expense.scenario_id == scenario_id)
        ).all()
    )

    try:
        with session.begin():
            if force:
                session.exec(delete(Expense).where(Expense.scenario_id == scenario_id))
                session.exec(delete(PlanEntry).where(PlanEntry.scenario_id == scenario_id))

                if candidate_budget_item_ids:
                    session.exec(
                        delete(PurchaseFormStatus).where(
                            PurchaseFormStatus.budget_item_id.in_(candidate_budget_item_ids)
                        )
                    )

                for budget_item_id in candidate_budget_item_ids:
                    remaining_plans = session.exec(
                        select(func.count()).where(PlanEntry.budget_item_id == budget_item_id)
                    ).one()
                    remaining_expenses = session.exec(
                        select(func.count()).where(Expense.budget_item_id == budget_item_id)
                    ).one()
                    if not remaining_plans and not remaining_expenses:
                        budget_item = session.get(BudgetItem, budget_item_id)
                        if budget_item:
                            session.delete(budget_item)

            session.delete(scenario)
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senaryonun bağlı kayıtları olduğu için silinemedi",
        )
    except SQLAlchemyError:
        logger.exception(
            "Beklenmedik bir hata nedeniyle senaryo silinemedi",
            extra={"scenario_id": scenario_id},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senaryo silinirken beklenmedik bir hata oluştu.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
