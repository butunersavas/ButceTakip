from functools import lru_cache
from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    app_name: str = "ButceTakip"
    database_url: str = Field(
        default="sqlite:///./butce_takip.db",
        env="DATABASE_URL",
    )
    secret_key: str = Field(default="change-me", env="SECRET_KEY")
    access_token_expire_minutes: int = Field(default=60 * 24, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    cors_origins: str = Field(default="*", env="CORS_ORIGINS")

    DEFAULT_ADMIN_EMAIL: str = Field(default="admin@example.com", env="DEFAULT_ADMIN_EMAIL")
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


@lru_cache()
def get_settings() -> Settings:
    return Settings()
