from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Task Central"
    app_env: str = "development"
    taskcentral_version: str = "1.1.0"
    changelog_path: str = ""
    database_url: str = ""
    cors_origins: str = "http://localhost:5173,http://localhost:8484"
    log_level: str = "INFO"
    log_dir: str = ""
    log_max_bytes: int = 5 * 1024 * 1024
    log_backup_count: int = 5
    secret_key: str = "change-me"
    data_dir: str = ""
    demo_mode: bool = False
    max_import_bytes: int = 20 * 1024 * 1024

    # Login (single user). Username is matched case-insensitively; password is
    # case-sensitive. Override via AUTH_USERNAME / AUTH_PASSWORD env vars.
    # New installations are gated by the setup wizard. These generic values
    # exist only as a legacy/CLI fallback and should be overridden by deploys.
    auth_username: str = "admin"
    auth_password: str = "change-me-on-first-run"
    auth_token_ttl_hours: int = 24 * 7

    @property
    def resolved_data_dir(self) -> Path:
        if self.data_dir:
            return Path(self.data_dir)
        return Path(__file__).resolve().parent.parent.parent / "data"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{self.resolved_data_dir / 'taskcentral.db'}"

    @property
    def resolved_log_dir(self) -> Path | None:
        return Path(self.log_dir) if self.log_dir else None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
