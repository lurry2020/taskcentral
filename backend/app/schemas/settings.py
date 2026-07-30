from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import MachineStatus
from app.services.llm import validate_local_base_url


class SettingsOut(BaseModel):
    app_name: str = "Task Central"
    timezone: str = "America/New_York"
    default_machine_status: str = "In Progress"
    date_format: str = "YYYY-MM-DD"
    default_page_size: int = 25
    confirm_destructive: bool = True
    default_task_category: str = "Other"
    required_task_behavior: str = "warn"
    obsidian_filename_format: str = "{name}.md"
    obsidian_include_checklist: bool = True
    obsidian_include_completed: bool = True
    obsidian_include_not_applicable: bool = False
    alerts_enabled: bool = False
    pending_task_threshold_hours: int = 24
    alert_frequency_hours: int = 24
    reminder_alerts_enabled: bool = False
    reminder_send_time: str = "09:00"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    llm_enabled: bool = False
    llm_provider: Literal["ollama", "openai_compatible"] = "ollama"
    llm_base_url: str = "http://host.docker.internal:11434"
    llm_model: str = ""
    llm_api_key: str = ""
    llm_timeout_seconds: int = 60
    llm_include_manual: bool = True


class SettingsUpdate(BaseModel):
    app_name: str | None = Field(default=None, min_length=1, max_length=100)
    timezone: str | None = Field(default=None, max_length=64)
    default_machine_status: MachineStatus | None = None
    date_format: str | None = Field(default=None, max_length=30)
    default_page_size: int | None = Field(default=None, ge=5, le=200)
    confirm_destructive: bool | None = None
    default_task_category: str | None = Field(default=None, max_length=60)
    required_task_behavior: str | None = None
    obsidian_filename_format: str | None = Field(default=None, max_length=100)
    obsidian_include_checklist: bool | None = None
    obsidian_include_completed: bool | None = None
    obsidian_include_not_applicable: bool | None = None
    alerts_enabled: bool | None = None
    pending_task_threshold_hours: int | None = Field(default=None, ge=1, le=8760)
    alert_frequency_hours: int | None = Field(default=None, ge=1, le=8760)
    reminder_alerts_enabled: bool | None = None
    reminder_send_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    telegram_bot_token: str | None = Field(default=None, max_length=200)
    telegram_chat_id: str | None = Field(default=None, max_length=64)
    llm_enabled: bool | None = None
    llm_provider: Literal["ollama", "openai_compatible"] | None = None
    llm_base_url: str | None = Field(default=None, min_length=1, max_length=500)
    llm_model: str | None = Field(default=None, max_length=200)
    llm_api_key: str | None = Field(default=None, max_length=500)
    llm_timeout_seconds: int | None = Field(default=None, ge=5, le=600)
    llm_include_manual: bool | None = None

    @field_validator("timezone")
    @classmethod
    def _timezone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        try:
            ZoneInfo(v)
        except Exception as exc:
            raise ValueError(f"Unknown timezone: {v}") from exc
        return v

    @field_validator("required_task_behavior")
    @classmethod
    def _behavior(cls, v: str | None) -> str | None:
        if v is not None and v not in ("warn", "ignore"):
            raise ValueError("required_task_behavior must be 'warn' or 'ignore'")
        return v

    @field_validator("obsidian_filename_format")
    @classmethod
    def _fmt(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if "{name}" not in v:
            raise ValueError("Filename format must contain {name}")
        if "/" in v or "\\" in v or ".." in v:
            raise ValueError("Filename format must not contain path separators")
        return v

    @field_validator("llm_base_url")
    @classmethod
    def _llm_url(cls, v: str | None) -> str | None:
        return validate_local_base_url(v) if v is not None else None


class TelegramTestRequest(BaseModel):
    # Sent from the (possibly unsaved) settings form so the user can test first.
    telegram_bot_token: str | None = Field(default=None, max_length=200)
    telegram_chat_id: str | None = Field(default=None, max_length=64)


class TelegramTestResult(BaseModel):
    ok: bool
    message: str


class LLMTestRequest(BaseModel):
    llm_provider: Literal["ollama", "openai_compatible"]
    llm_base_url: str = Field(min_length=1, max_length=500)
    llm_model: str = Field(min_length=1, max_length=200)
    llm_api_key: str = Field(default="", max_length=500)
    llm_timeout_seconds: int = Field(default=60, ge=5, le=600)

    @field_validator("llm_base_url")
    @classmethod
    def _local_url(cls, v: str) -> str:
        return validate_local_base_url(v)


class LLMTestResult(BaseModel):
    ok: bool
    message: str
    reply: str | None = None


class LLMModelsRequest(BaseModel):
    llm_provider: Literal["ollama", "openai_compatible"]
    llm_base_url: str = Field(min_length=1, max_length=500)
    llm_api_key: str = Field(default="", max_length=500)
    llm_timeout_seconds: int = Field(default=60, ge=5, le=600)

    @field_validator("llm_base_url")
    @classmethod
    def _local_url(cls, v: str) -> str:
        return validate_local_base_url(v)


class LLMModelsResult(BaseModel):
    ok: bool
    message: str
    models: list[str] = Field(default_factory=list)
