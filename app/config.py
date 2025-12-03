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
    admin_password: str | None = Field(default=None, env="ADMIN_PASSWORD")
    admin_full_name: str = Field(
        default="Sistem Yöneticisi", env="ADMIN_FULL_NAME"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
