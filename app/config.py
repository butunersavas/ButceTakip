import hashlib
import json
from functools import lru_cache
from pydantic import BaseSettings, Field, validator


PRODUCTION_ENVIRONMENTS = {"prod", "production"}
DEFAULT_SECRET_KEY = "change-me"
MIN_PRODUCTION_SECRET_KEY_LENGTH = 32
MIN_PRODUCTION_ADMIN_PASSWORD_LENGTH = 14
KNOWN_UNSAFE_ADMIN_PASSWORD_HASHES = {
    # SHA-256 fingerprint of the legacy repository default. The password itself
    # must not be kept in source control or included in validation errors.
    "d840c64ea6c7f64abba7a4bd41d3e1e242ab1cb40a192e02570ae89e8a1028ac",
}
KNOWN_UNSAFE_SECRET_KEYS = {
    "change-me",
    "changeme",
    "secret",
    "secret-key",
    "your-secret-key",
    "replace-me",
}


def _fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _is_weak_secret_key(value: str) -> bool:
    normalized = value.strip()
    return (
        not normalized
        or normalized.lower() in KNOWN_UNSAFE_SECRET_KEYS
        or len(normalized) < MIN_PRODUCTION_SECRET_KEY_LENGTH
        or len(set(normalized)) < 8
    )


def _is_strong_admin_password(value: str) -> bool:
    if len(value) < MIN_PRODUCTION_ADMIN_PASSWORD_LENGTH:
        return False
    character_checks = (
        any(character.islower() for character in value),
        any(character.isupper() for character in value),
        any(character.isdigit() for character in value),
        any(not character.isalnum() for character in value),
    )
    return all(character_checks)


class Settings(BaseSettings):
    app_name: str = "ButceTakip"
    environment: str = Field(default="development", env=["ENVIRONMENT", "ENV", "APP_ENV"])
    database_url: str = Field(
        default="sqlite:///./butce_takip.db",
        env="DATABASE_URL",
    )
    secret_key: str = Field(default=DEFAULT_SECRET_KEY, env="SECRET_KEY")
    algorithm: str = Field(default="HS256", env="ALGORITHM")
    access_token_expire_minutes: int = Field(default=60 * 24, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    allowed_hosts: list[str] = Field(
        default=["*"],
        env="ALLOWED_HOSTS",
    )
    trusted_hosts: list[str] | None = Field(default=None, env="TRUSTED_HOSTS")
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://172.24.2.128:5173",
            "http://10.10.3.4:5173",
        ],
        env=["CORS_ORIGINS", "ALLOWED_ORIGINS"],
    )
    cors_allow_credentials: bool = Field(default=True, env="CORS_ALLOW_CREDENTIALS")
    quote_storage_path: str = Field(
        default="./data/quote_documents", env="QUOTE_STORAGE_PATH"
    )
    quote_document_max_bytes: int = Field(
        default=20 * 1024 * 1024, env="QUOTE_DOCUMENT_MAX_BYTES"
    )

    ADMIN_BOOTSTRAP_ENABLED: bool = Field(default=False, env="ADMIN_BOOTSTRAP_ENABLED")
    DEFAULT_ADMIN_EMAIL: str = Field(default="", env="DEFAULT_ADMIN_EMAIL")
    DEFAULT_ADMIN_PASSWORD: str = Field(default="", env="DEFAULT_ADMIN_PASSWORD")
    DEFAULT_ADMIN_FULL_NAME: str = Field(default="Admin Kullanıcı", env="DEFAULT_ADMIN_FULL_NAME")
    DEFAULT_ADMIN_ROLE: str = Field(default="admin", env="DEFAULT_ADMIN_ROLE")

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in PRODUCTION_ENVIRONMENTS

    @property
    def admin_bootstrap_enabled(self) -> bool:
        return self.ADMIN_BOOTSTRAP_ENABLED

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

    def validate_runtime_security(self) -> None:
        """Reject unsafe production secrets without exposing their values."""

        if not self.is_production:
            return

        errors: list[str] = []
        secret_key = self.secret_key.strip()
        admin_email = self.DEFAULT_ADMIN_EMAIL.strip().lower()
        admin_password = self.DEFAULT_ADMIN_PASSWORD

        if _is_weak_secret_key(secret_key):
            errors.append(
                "SECRET_KEY must be a non-default value with at least "
                f"{MIN_PRODUCTION_SECRET_KEY_LENGTH} characters."
            )

        if admin_password and _fingerprint(admin_password) in KNOWN_UNSAFE_ADMIN_PASSWORD_HASHES:
            errors.append("DEFAULT_ADMIN_PASSWORD uses a known unsafe legacy default.")

        if self.ADMIN_BOOTSTRAP_ENABLED:
            if (
                not admin_email
                or "@" not in admin_email
                or any(character.isspace() for character in admin_email)
                or admin_email == "admin@local"
            ):
                errors.append(
                    "DEFAULT_ADMIN_EMAIL must be explicitly set to a non-default address "
                    "when production bootstrap is enabled."
                )
            if not admin_password:
                errors.append(
                    "DEFAULT_ADMIN_PASSWORD must be explicitly set when production bootstrap "
                    "is enabled."
                )
            elif not _is_strong_admin_password(admin_password):
                errors.append(
                    "DEFAULT_ADMIN_PASSWORD must contain at least "
                    f"{MIN_PRODUCTION_ADMIN_PASSWORD_LENGTH} characters including upper-case, "
                    "lower-case, numeric, and special characters."
                )

        if errors:
            raise RuntimeError("Unsafe production configuration: " + " ".join(errors))

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

        @classmethod
        def parse_env_var(cls, field_name: str, raw_value: str):
            if field_name in {"allowed_hosts", "cors_origins", "trusted_hosts"}:
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
    def preserve_secret_key(cls, value: str) -> str:  # noqa: D417
        return value or ""

    @validator("allowed_hosts", pre=True)
    def normalize_allowed_hosts(cls, value: str | list[str] | None) -> list[str]:  # noqa: D417
        default_hosts = ["*"]
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

    @validator("trusted_hosts", pre=True)
    def normalize_trusted_hosts(cls, value: str | list[str] | None) -> list[str] | None:  # noqa: D417
        if value is None:
            return None
        if isinstance(value, list):
            cleaned = [item.strip() for item in value if item and item.strip()]
            return cleaned
        raw = str(value).strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except Exception:
            pass
        return [item.strip() for item in raw.split(",") if item.strip()]

    @validator("allowed_hosts", "cors_origins", "trusted_hosts", pre=True)
    def split_csv_values(cls, value: str | list[str]) -> list[str]:  # noqa: D417
        if isinstance(value, list):
            return [item.strip() for item in value if item and item.strip()]
        if not value:
            return []
        return [item.strip() for item in str(value).split(",") if item.strip()]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
