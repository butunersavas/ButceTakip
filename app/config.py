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
        default=["localhost", "127.0.0.1", "172.24.2.128"],
        env="ALLOWED_HOSTS",
    )
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://172.24.2.128:5173",
        ],
        env="CORS_ORIGINS",
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

    @validator("secret_key")
    def normalize_secret_key(cls, value: str) -> str:  # noqa: D417
        if value and value.strip():
            return value
        return "change-me"

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
