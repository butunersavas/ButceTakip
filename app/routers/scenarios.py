from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.dependencies import get_admin_user, get_current_user, get_db_session
from app.models import Scenario, User
from app.schemas import ScenarioCreate, ScenarioRead, ScenarioUpdate

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])


@router.get("/", response_model=list[ScenarioRead])
def list_scenarios(
    session: Session = Depends(get_db_session), current_user: User = Depends(get_current_user)
) -> list[Scenario]:
    return session.exec(select(Scenario).where(Scenario.year >= 0)).all()


@router.post("/", response_model=ScenarioRead, status_code=status.HTTP_201_CREATED)
def create_scenario(
    scenario_in: ScenarioCreate,
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> Scenario:
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
    _: User = Depends(get_admin_user),
) -> Scenario:
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
    session: Session = Depends(get_db_session),
    _: User = Depends(get_admin_user),
) -> None:
    scenario = session.get(Scenario, scenario_id)
    if not scenario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")
    session.delete(scenario)
    session.commit()
