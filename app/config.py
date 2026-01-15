import json
from functools import lru_cache
from pydantic import BaseSettings, Field, validator


class Settings(BaseSettings):
    app_name: str = "ButceTakip"
    database_url: str = Field(
        default="sqlite:///./butce_takip.db",
        env="DATABASE_URL",
    )
    secret_key: str = Field(default="change-me", env="SECRET_KEY")
    algorithm: str = Field(default="HS256", env="ALGORITHM")
    access_token_expire_minutes: int = Field(default=60 * 24, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    allowed_hosts: list[str] = Field(
        default=["localhost", "127.0.0.1", "0.0.0.0", "172.24.2.128"],
        env="ALLOWED_HOSTS",
    )
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:5173",
            "http://localhost:8000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:8000",
            "http://172.24.2.128:5173",
        ],
        env=["CORS_ORIGINS", "ALLOWED_ORIGINS"],
    )

    DEFAULT_ADMIN_EMAIL: str = Field(default="admin@local", env="DEFAULT_ADMIN_EMAIL")
    DEFAULT_ADMIN_PASSWORD: str = Field(default="GucluBirSifre123!", env="DEFAULT_ADMIN_PASSWORD")
    DEFAULT_ADMIN_FULL_NAME: str = Field(default="Admin Kullanıcı", env="DEFAULT_ADMIN_FULL_NAME")
    DEFAULT_ADMIN_ROLE: str = Field(default="admin", env="DEFAULT_ADMIN_ROLE")

    @property
    def default_admin_email(self) -> str:
        """Backward compatible accessor for the default admin email."""

        return self.DEFAULT_ADMIN_EMAIL

    @property
    def default_admin_password(self) -> str:
        """Backward compatible accessor for the default admin password."""

        return self.DEFAULT_ADMIN_PASSWORD

    @property
    def default_admin_full_name(self) -> str:
        """Backward compatible accessor for the default admin full name."""

        return self.DEFAULT_ADMIN_FULL_NAME

    @property
    def default_admin_role(self) -> str:
        """Backward compatible accessor for the default admin role."""

        return self.DEFAULT_ADMIN_ROLE

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

        @classmethod
        def parse_env_var(cls, field_name: str, raw_value: str):
            if field_name in {"allowed_hosts", "cors_origins"}:
                if raw_value is None:
                    return []

                raw_text = str(raw_value).strip()
                if not raw_text:
                    return []

                try:
                    parsed = json.loads(raw_text)
                    if isinstance(parsed, list):
                        return parsed
                except Exception:
                    pass

                return [item.strip() for item in raw_text.split(",") if item.strip()]

            try:
                return json.loads(raw_value)
            except Exception:
                return raw_value

    @validator("secret_key")
    def normalize_secret_key(cls, value: str) -> str:  # noqa: D417
        if value and value.strip():
            return value
        return "change-me"

    @validator("allowed_hosts", pre=True)
    def normalize_allowed_hosts(cls, value: str | list[str] | None) -> list[str]:  # noqa: D417
        default_hosts = ["localhost", "127.0.0.1", "0.0.0.0"]
        if value is None:
            return default_hosts
        if isinstance(value, list):
            cleaned = [item.strip() for item in value if item and item.strip()]
            return cleaned or default_hosts
        raw = str(value).strip()
        if not raw:
            return default_hosts
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                cleaned = [str(item).strip() for item in parsed if str(item).strip()]
                return cleaned or default_hosts
        except Exception:
            pass
        cleaned = [item.strip() for item in raw.split(",") if item.strip()]
        return cleaned or default_hosts

    @validator("allowed_hosts", "cors_origins", pre=True)
    def split_csv_values(cls, value: str | list[str]) -> list[str]:  # noqa: D417
        if isinstance(value, list):
            return [item.strip() for item in value if item and item.strip()]
        if not value:
            return []
        return [item.strip() for item in str(value).split(",") if item.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
