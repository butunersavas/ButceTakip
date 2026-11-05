from datetime import timedelta
import unittest
from unittest.mock import patch

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app import database as database_module
from app import main as app_main
from app.config import Settings, _fingerprint
from app.models import User
from app.utils import security as security_module
from app.utils.security import get_password_hash, verify_password
from scripts import reset_admin as reset_admin_module


STRONG_PRODUCTION_SECRET = "UnitTest-Only-Production-Secret-Key-2026!"
STRONG_BOOTSTRAP_PASSWORD = "UnitTest-Only-Admin-Password-2026!"


def _settings(**overrides) -> Settings:
    values = {
        "environment": "test",
        "secret_key": "test-secret",
        "ADMIN_BOOTSTRAP_ENABLED": True,
        "DEFAULT_ADMIN_EMAIL": "first-admin@example.test",
        "DEFAULT_ADMIN_PASSWORD": STRONG_BOOTSTRAP_PASSWORD,
        "DEFAULT_ADMIN_FULL_NAME": "First Admin",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


class AdminBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_first_install_creates_admin_only_when_explicitly_enabled(self) -> None:
        with Session(self.engine) as session, patch.object(
            database_module, "settings", _settings()
        ):
            database_module.init_default_admin(session)
            admin = session.exec(select(User).where(User.username == "admin")).one()

            self.assertEqual("first-admin@example.test", admin.email)
            self.assertEqual("First Admin", admin.full_name)
            self.assertEqual("admin", admin.role)
            self.assertTrue(admin.is_admin)
            self.assertTrue(admin.is_active)
            self.assertTrue(verify_password(STRONG_BOOTSTRAP_PASSWORD, admin.hashed_password))

    def test_disabled_bootstrap_does_not_create_a_user(self) -> None:
        settings = _settings(ADMIN_BOOTSTRAP_ENABLED=False)
        with Session(self.engine) as session, patch.object(database_module, "settings", settings):
            database_module.init_default_admin(session)
            self.assertEqual([], session.exec(select(User)).all())

    def test_restart_preserves_changed_admin_credentials_and_profile(self) -> None:
        bootstrap_settings = _settings()
        changed_password = "Changed-After-First-Login-2026!"

        with patch.object(database_module, "settings", bootstrap_settings):
            with Session(self.engine) as session:
                database_module.init_default_admin(session)

            with Session(self.engine) as session:
                admin = session.exec(select(User).where(User.username == "admin")).one()
                admin.hashed_password = get_password_hash(changed_password)
                admin.email = "managed-admin@example.test"
                admin.role = "managed-admin"
                admin.is_active = False
                session.add(admin)
                session.commit()

            with Session(self.engine) as restarted_session:
                database_module.init_default_admin(restarted_session)
                admin = restarted_session.exec(
                    select(User).where(User.username == "admin")
                ).one()

                self.assertTrue(verify_password(changed_password, admin.hashed_password))
                self.assertFalse(
                    verify_password(STRONG_BOOTSTRAP_PASSWORD, admin.hashed_password)
                )
                self.assertEqual("managed-admin@example.test", admin.email)
                self.assertEqual("managed-admin", admin.role)
                self.assertFalse(admin.is_active)

    def test_existing_users_are_never_mutated_or_supplemented(self) -> None:
        admin_hash = get_password_hash("Existing-Admin-Password-2026!")
        user_hash = get_password_hash("Existing-User-Password-2026!")
        with Session(self.engine) as session:
            session.add_all(
                [
                    User(
                        username="admin",
                        email="existing-admin@example.test",
                        full_name="Existing Admin",
                        hashed_password=admin_hash,
                        is_admin=True,
                        role="custom-admin",
                        is_active=False,
                    ),
                    User(
                        username="existing-user",
                        email="existing-user@example.test",
                        hashed_password=user_hash,
                        role="viewer",
                        is_active=True,
                    ),
                ]
            )
            session.commit()

        replacement_settings = _settings(
            DEFAULT_ADMIN_EMAIL="replacement@example.test",
            DEFAULT_ADMIN_PASSWORD="Replacement-Password-2026!",
        )
        with Session(self.engine) as session, patch.object(
            database_module, "settings", replacement_settings
        ):
            database_module.init_default_admin(session)
            users = session.exec(select(User).order_by(User.username)).all()

            self.assertEqual(2, len(users))
            admin = next(user for user in users if user.username == "admin")
            existing_user = next(user for user in users if user.username == "existing-user")
            self.assertEqual("existing-admin@example.test", admin.email)
            self.assertEqual("Existing Admin", admin.full_name)
            self.assertEqual(admin_hash, admin.hashed_password)
            self.assertEqual("custom-admin", admin.role)
            self.assertFalse(admin.is_active)
            self.assertEqual(user_hash, existing_user.hashed_password)
            self.assertEqual("viewer", existing_user.role)
            self.assertTrue(existing_user.is_active)

    def test_manual_reset_requires_explicit_password(self) -> None:
        with patch.object(reset_admin_module, "engine", self.engine), patch.object(
            reset_admin_module, "get_settings", return_value=_settings(ADMIN_BOOTSTRAP_ENABLED=False)
        ):
            with self.assertRaisesRegex(ValueError, "parolası açıkça"):
                reset_admin_module.reset_admin(
                    email="manual-admin@example.test",
                    password="",
                )

    def test_manual_reset_keeps_admin_flag_and_role_consistent(self) -> None:
        with Session(self.engine) as session:
            session.add(
                User(
                    username="admin",
                    email="manual-admin@example.test",
                    hashed_password=get_password_hash("Existing-Password-2026!"),
                    is_admin=False,
                    role="viewer",
                    is_active=False,
                )
            )
            session.commit()

        with patch.object(reset_admin_module, "engine", self.engine), patch.object(
            reset_admin_module,
            "get_settings",
            return_value=_settings(ADMIN_BOOTSTRAP_ENABLED=False),
        ):
            user = reset_admin_module.reset_admin(
                email="manual-admin@example.test",
                password="Replacement-Password-2026!",
            )

        self.assertTrue(user.is_admin)
        self.assertEqual("admin", user.role)
        self.assertTrue(user.is_active)


class ProductionSecurityValidationTests(unittest.TestCase):
    def test_existing_jwt_encode_decode_contract_is_preserved(self) -> None:
        jwt_settings = _settings(
            secret_key=STRONG_PRODUCTION_SECRET,
            ADMIN_BOOTSTRAP_ENABLED=False,
        )
        with patch.object(security_module, "settings", jwt_settings):
            token = security_module.create_access_token(
                data={"sub": "42", "is_admin": True, "role": "admin"},
                expires_delta=timedelta(minutes=5),
            )
            token_data = security_module.decode_access_token(token)

        self.assertEqual(42, token_data.user_id)

    def test_development_and_test_keep_backward_compatible_defaults(self) -> None:
        settings = _settings(
            environment="development",
            secret_key="change-me",
            DEFAULT_ADMIN_EMAIL="admin@local",
            DEFAULT_ADMIN_PASSWORD="short",
        )
        settings.validate_runtime_security()

    def test_required_production_mode_rejects_development_environment(self) -> None:
        settings = _settings(
            environment="development",
            production_mode_required=True,
            ADMIN_BOOTSTRAP_ENABLED=False,
        )
        with self.assertRaisesRegex(RuntimeError, "APP_ENV"):
            settings.validate_runtime_security()

    def test_production_rejects_empty_default_and_weak_secret_keys(self) -> None:
        for secret_key in ("", "change-me", "short-secret"):
            with self.subTest(secret_key_length=len(secret_key)):
                settings = _settings(
                    environment="production",
                    secret_key=secret_key,
                    ADMIN_BOOTSTRAP_ENABLED=False,
                    DEFAULT_ADMIN_EMAIL="",
                    DEFAULT_ADMIN_PASSWORD="",
                )
                with self.assertRaisesRegex(RuntimeError, "SECRET_KEY"):
                    settings.validate_runtime_security()

    def test_production_rejects_known_unsafe_admin_password_without_disclosure(self) -> None:
        known_unsafe_password = "Known-Unsafe-Test-Password-2026!"
        settings = _settings(
            environment="production",
            secret_key=STRONG_PRODUCTION_SECRET,
            ADMIN_BOOTSTRAP_ENABLED=False,
            DEFAULT_ADMIN_PASSWORD=known_unsafe_password,
        )

        with patch(
            "app.config.KNOWN_UNSAFE_ADMIN_PASSWORD_HASHES",
            {_fingerprint(known_unsafe_password)},
        ):
            with self.assertRaises(RuntimeError) as context:
                settings.validate_runtime_security()

        self.assertIn("known unsafe legacy default", str(context.exception))
        self.assertNotIn(known_unsafe_password, str(context.exception))

    def test_production_bootstrap_requires_explicit_secure_credentials(self) -> None:
        unsafe_cases = (
            {
                "DEFAULT_ADMIN_EMAIL": "",
                "DEFAULT_ADMIN_PASSWORD": STRONG_BOOTSTRAP_PASSWORD,
            },
            {
                "DEFAULT_ADMIN_EMAIL": "admin@local",
                "DEFAULT_ADMIN_PASSWORD": STRONG_BOOTSTRAP_PASSWORD,
            },
            {
                "DEFAULT_ADMIN_EMAIL": "secure-admin@example.test",
                "DEFAULT_ADMIN_PASSWORD": "weak",
            },
        )
        for overrides in unsafe_cases:
            with self.subTest(overrides=tuple(overrides)):
                settings = _settings(
                    environment="production",
                    secret_key=STRONG_PRODUCTION_SECRET,
                    ADMIN_BOOTSTRAP_ENABLED=True,
                    **overrides,
                )
                with self.assertRaises(RuntimeError):
                    settings.validate_runtime_security()

        safe_settings = _settings(
            environment="production",
            secret_key=STRONG_PRODUCTION_SECRET,
            ADMIN_BOOTSTRAP_ENABLED=True,
            DEFAULT_ADMIN_EMAIL="secure-admin@example.test",
            DEFAULT_ADMIN_PASSWORD=STRONG_BOOTSTRAP_PASSWORD,
        )
        safe_settings.validate_runtime_security()

    def test_production_api_startup_rejects_automatic_bootstrap(self) -> None:
        settings = _settings(
            environment="production",
            secret_key=STRONG_PRODUCTION_SECRET,
            ADMIN_BOOTSTRAP_ENABLED=True,
            DEFAULT_ADMIN_EMAIL="secure-admin@example.test",
            DEFAULT_ADMIN_PASSWORD=STRONG_BOOTSTRAP_PASSWORD,
        )

        with self.assertRaisesRegex(RuntimeError, "explicit bootstrap command"):
            settings.validate_runtime_security(api_startup=True)

    def test_startup_validates_before_database_initialization(self) -> None:
        unsafe_settings = _settings(
            environment="production",
            secret_key="change-me",
            ADMIN_BOOTSTRAP_ENABLED=False,
            DEFAULT_ADMIN_EMAIL="",
            DEFAULT_ADMIN_PASSWORD="",
        )
        with patch.object(app_main, "settings", unsafe_settings), patch.object(
            app_main, "init_db"
        ) as init_db:
            with self.assertRaises(RuntimeError):
                app_main.on_startup()

        init_db.assert_not_called()


if __name__ == "__main__":
    unittest.main()
