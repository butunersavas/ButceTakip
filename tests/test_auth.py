"""Authentication regression tests.

These tests focus on the default administrator bootstrap logic.  They verify
that the application seeds the admin user during startup and that the
credentials can be used with the low-level authentication routine that backs
the `/auth/token` endpoint.  The workflow avoids the HTTP test client so that
it exercises the same code paths without introducing additional third-party
dependencies that complicate Docker builds.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import Dict, Generator

import pytest
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select


@pytest.fixture()
def auth_test_context(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[Dict, None, None]:
    """Prepare an isolated database and reload modules with deterministic env vars."""

    db_path = tmp_path / "test_auth.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("DEFAULT_ADMIN_EMAIL", "integration.admin@example.com")
    monkeypatch.setenv("DEFAULT_ADMIN_PASSWORD", "Sifre123!@")
    monkeypatch.setenv("DEFAULT_ADMIN_FULL_NAME", "Integration Admin")
    monkeypatch.setenv("DEFAULT_ADMIN_ROLE", "admin")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")

    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    config_module = importlib.import_module("app.config")
    config_module.get_settings.cache_clear()
    importlib.reload(config_module)

    # Reload other modules that depend on configuration so they pick up the test env vars.
    database_module = importlib.import_module("app.database")
    security_module = importlib.import_module("app.utils.security")
    auth_module = importlib.import_module("app.routers.auth")

    importlib.reload(database_module)
    importlib.reload(security_module)
    importlib.reload(auth_module)

    database_module.init_db()

    with database_module.get_session() as session:
        yield {
            "session": session,
            "settings": config_module.get_settings(),
            "database": database_module,
            "security": security_module,
            "auth": auth_module,
            "models": importlib.import_module("app.models"),
        }


def test_default_admin_seeded(auth_test_context: Dict[str, object]) -> None:
    session: Session = auth_test_context["session"]
    settings = auth_test_context["settings"]
    security = auth_test_context["security"]
    models = auth_test_context["models"]

    admin = session.exec(
        select(models.User).where(models.User.email == settings.default_admin_email)
    ).first()

    assert admin is not None, "Default admin user should be created during startup"
    assert admin.role == settings.default_admin_role
    assert security.verify_password(settings.default_admin_password, admin.hashed_password)


def test_default_admin_credentials_issue_token(auth_test_context: Dict[str, object]) -> None:
    session: Session = auth_test_context["session"]
    settings = auth_test_context["settings"]
    security = auth_test_context["security"]
    auth = auth_test_context["auth"]
    models = auth_test_context["models"]

    form = OAuth2PasswordRequestForm(
        username=settings.default_admin_email,
        password=settings.default_admin_password,
        scope="",
    )

    token = auth.login_for_access_token(form, session=session)
    assert token.access_token, "Login endpoint should return an access token"

    token_data = security.decode_access_token(token.access_token)
    admin = session.exec(
        select(models.User).where(models.User.email == settings.default_admin_email)
    ).first()

    assert admin is not None
    assert token_data.user_id == admin.id
