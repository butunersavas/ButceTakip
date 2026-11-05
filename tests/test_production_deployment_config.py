from pathlib import Path
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


class ProductionDeploymentConfigTests(unittest.TestCase):
    def test_production_override_forces_fail_closed_environment(self) -> None:
        content = (
            REPOSITORY_ROOT / "docker-compose.production.yaml"
        ).read_text(encoding="utf-8")

        self.assertIn("APP_ENV=production", content)
        self.assertIn("PRODUCTION_MODE_REQUIRED=true", content)
        self.assertIn("ADMIN_BOOTSTRAP_ENABLED=false", content)
        self.assertIn("SECRET_KEY=${SECRET_KEY:?", content)
        self.assertIn("DATABASE_URL=${DATABASE_URL:?", content)

    def test_development_compose_keeps_development_default(self) -> None:
        content = (REPOSITORY_ROOT / "docker-compose.yaml").read_text(
            encoding="utf-8"
        )

        self.assertIn("APP_ENV=${APP_ENV:-development}", content)


if __name__ == "__main__":
    unittest.main()
