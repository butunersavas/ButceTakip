import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def test_client(tmp_path, monkeypatch):
    db_path = tmp_path / "test_auth.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("DEFAULT_ADMIN_EMAIL", "integration.admin@example.com")
    monkeypatch.setenv("DEFAULT_ADMIN_PASSWORD", "Sifre123!@")
    monkeypatch.setenv("DEFAULT_ADMIN_FULL_NAME", "Integration Admin")
    monkeypatch.setenv("DEFAULT_ADMIN_ROLE", "admin")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")

    # Reload configuration-dependent modules to ensure they pick up the new env vars
    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    config_module = importlib.import_module("app.config")
    config_module.get_settings.cache_clear()
    importlib.reload(config_module)

    database_module = importlib.import_module("app.database")
    importlib.reload(database_module)

    main_module = importlib.import_module("app.main")
    importlib.reload(main_module)

    client = TestClient(main_module.app)
    with client:
        yield client


def test_default_admin_can_log_in(test_client):
    response = test_client.post(
        "/auth/token",
        data={
            "username": "integration.admin@example.com",
            "password": "Sifre123!@",
            "grant_type": "password",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]

    profile_response = test_client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert profile_response.status_code == 200
    payload = profile_response.json()
    assert payload["email"] == "integration.admin@example.com"
    assert payload["role"] == "admin"
