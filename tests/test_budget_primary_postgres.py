import unittest

from sqlalchemy import func
from sqlmodel import Session, select

from app.database import engine
from app.models import BudgetPreparation, Scenario, User
from app.routers.budget_preparations import make_primary


@unittest.skipUnless(
    engine.dialect.name == "postgresql",
    "PostgreSQL Ana Bütçe regression testi yalnız PostgreSQL bağlantısında çalışır.",
)
class BudgetPrimaryPostgresTests(unittest.TestCase):
    test_year = 987654

    def setUp(self) -> None:
        self.session = Session(engine)
        if self.session.exec(select(Scenario).where(Scenario.year == self.test_year)).first():
            self.session.close()
            self.skipTest("PostgreSQL regression test yılı kullanımda.")

        self.scenario_a = Scenario(name="PG Primary Regression A", year=self.test_year, is_primary=True)
        self.scenario_b = Scenario(name="PG Primary Regression B", year=self.test_year, is_primary=False)
        self.session.add(self.scenario_a)
        self.session.add(self.scenario_b)
        self.session.commit()
        self.session.refresh(self.scenario_a)
        self.session.refresh(self.scenario_b)

        self.preparation_a = BudgetPreparation(
            year=self.test_year,
            name="PG Primary Regression A",
            status="ACTIVE",
            activated_scenario_id=self.scenario_a.id,
        )
        self.preparation_b = BudgetPreparation(
            year=self.test_year,
            name="PG Primary Regression B",
            status="ACTIVE",
            activated_scenario_id=self.scenario_b.id,
        )
        self.session.add(self.preparation_a)
        self.session.add(self.preparation_b)
        self.session.commit()
        self.session.refresh(self.preparation_a)
        self.session.refresh(self.preparation_b)
        self.user = User(username="pg-primary-regression", hashed_password="unused", role="admin")

    def tearDown(self) -> None:
        if not hasattr(self, "session"):
            return
        try:
            for preparation in (getattr(self, "preparation_a", None), getattr(self, "preparation_b", None)):
                if preparation and preparation.id:
                    persisted = self.session.get(BudgetPreparation, preparation.id)
                    if persisted:
                        self.session.delete(persisted)
            self.session.commit()
            for scenario in (getattr(self, "scenario_a", None), getattr(self, "scenario_b", None)):
                if scenario and scenario.id:
                    persisted = self.session.get(Scenario, scenario.id)
                    if persisted:
                        self.session.delete(persisted)
            self.session.commit()
        finally:
            self.session.close()

    def assert_primary(self, expected_id: int) -> None:
        scenarios = self.session.exec(
            select(Scenario).where(Scenario.year == self.test_year).order_by(Scenario.id)
        ).all()
        self.assertEqual(2, len(scenarios))
        self.assertEqual([expected_id], [scenario.id for scenario in scenarios if scenario.is_primary])
        primary_count = self.session.exec(
            select(func.count(Scenario.id)).where(
                Scenario.year == self.test_year,
                Scenario.is_primary.is_(True),
            )
        ).one()
        self.assertEqual(1, primary_count)

    def test_primary_switch_is_two_phase_and_reversible(self) -> None:
        result_b = make_primary(self.preparation_b.id, self.session, self.user)
        self.assertEqual(self.preparation_b.id, result_b.id)
        self.assert_primary(self.scenario_b.id)

        result_a = make_primary(self.preparation_a.id, self.session, self.user)
        self.assertEqual(self.preparation_a.id, result_a.id)
        self.assert_primary(self.scenario_a.id)


if __name__ == "__main__":
    unittest.main()
