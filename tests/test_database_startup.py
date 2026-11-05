import unittest
from unittest.mock import patch

from sqlalchemy import text
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app import database as database_module
from app.config import Settings
from app.models import User


def _settings(*, environment: str = "test") -> Settings:
    return Settings(
        _env_file=None,
        environment=environment,
        secret_key="UnitTest-Only-Database-Startup-Secret-2026!",
        ADMIN_BOOTSTRAP_ENABLED=False,
    )


class DatabaseStartupSafetyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

    def tearDown(self) -> None:
        self.engine.dispose()

    def _database_patches(self, *, environment: str = "test"):
        return patch.multiple(
            database_module,
            engine=self.engine,
            settings=_settings(environment=environment),
            is_sqlite=True,
        )

    def test_explicit_migration_is_idempotent_and_preserves_existing_user(self) -> None:
        with self._database_patches():
            database_module.apply_schema_migrations()
            with Session(self.engine) as session:
                session.add(
                    User(
                        username="preserved-user",
                        email="preserved-user@example.test",
                        hashed_password="preserved-password-hash",
                        is_admin=False,
                        role="viewer",
                        is_active=False,
                    )
                )
                session.commit()

            database_module.apply_schema_migrations()

            with Session(self.engine) as session:
                user = session.exec(
                    select(User).where(User.username == "preserved-user")
                ).one()
                self.assertEqual("preserved-user@example.test", user.email)
                self.assertEqual("preserved-password-hash", user.hashed_password)
                self.assertFalse(user.is_admin)
                self.assertEqual("viewer", user.role)
                self.assertFalse(user.is_active)

    def test_baseline_records_version_without_mutating_application_data(self) -> None:
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add(
                User(
                    username="baseline-user",
                    email="baseline-user@example.test",
                    hashed_password="baseline-hash",
                    is_admin=True,
                    role="custom-admin",
                    is_active=False,
                )
            )
            session.commit()

        with self._database_patches():
            database_module.baseline_schema_version()
            database_module.validate_database_schema()

        with Session(self.engine) as session:
            user = session.exec(
                select(User).where(User.username == "baseline-user")
            ).one()
            self.assertEqual("baseline-hash", user.hashed_password)
            self.assertEqual("custom-admin", user.role)
            self.assertFalse(user.is_active)

    def test_schema_version_mismatch_rejects_without_mutating_user(self) -> None:
        with self._database_patches():
            database_module.apply_schema_migrations()
            with Session(self.engine) as session:
                session.add(
                    User(
                        username="version-user",
                        email="version-user@example.test",
                        hashed_password="version-hash",
                        role="user",
                    )
                )
                session.commit()
            with self.engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE app_schema_version "
                        "SET version = 'unexpected-version' WHERE id = 1"
                    )
                )

            with self.assertRaisesRegex(
                database_module.SchemaValidationError,
                "expected",
            ):
                database_module.validate_database_schema()

            with Session(self.engine) as session:
                user = session.exec(
                    select(User).where(User.username == "version-user")
                ).one()
                self.assertEqual("version-hash", user.hashed_password)
                self.assertEqual("user", user.role)

    def test_missing_schema_is_rejected_without_creating_tables(self) -> None:
        with self._database_patches():
            with self.assertRaisesRegex(
                database_module.SchemaValidationError,
                "schema version marker is missing",
            ):
                database_module.validate_database_schema()

        with self.engine.connect() as connection:
            table_names = set(database_module.inspect(connection).get_table_names())
        self.assertEqual(set(), table_names)

    def test_production_init_only_validates_and_never_runs_schema_writes(self) -> None:
        with self._database_patches(environment="production"), patch.object(
            database_module, "validate_database_schema"
        ) as validate_schema, patch.object(
            database_module, "apply_schema_migrations"
        ) as apply_migrations, patch.object(
            database_module, "init_default_admin"
        ) as init_admin:
            database_module.init_db()

        validate_schema.assert_called_once_with(require_postgresql=True)
        apply_migrations.assert_not_called()
        init_admin.assert_not_called()


if __name__ == "__main__":
    unittest.main()
