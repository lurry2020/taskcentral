from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.llm import validate_local_base_url


class SetupStatus(BaseModel):
    completed: bool
    required: bool


class SetupCompleteRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=6, max_length=400)
    password_confirmation: str = Field(min_length=6, max_length=400)
    timezone: str = Field(max_length=64)
    date_format: Literal["YYYY-MM-DD", "DD.MM.YYYY", "MM/DD/YYYY"]

    telegram_configured: bool = False
    telegram_bot_token: str = Field(default="", max_length=200)
    telegram_chat_id: str = Field(default="", max_length=64)

    llm_configured: bool = False
    llm_provider: Literal["ollama", "openai_compatible"] = "ollama"
    llm_base_url: str = Field(default="http://host.docker.internal:11434", max_length=500)
    llm_model: str = Field(default="", max_length=200)
    llm_api_key: str = Field(default="", max_length=500)
    llm_timeout_seconds: int = Field(default=60, ge=5, le=600)

    @field_validator("username")
    @classmethod
    def _username(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Username is required.")
        return value

    @field_validator("timezone")
    @classmethod
    def _timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except Exception as exc:
            raise ValueError(f"Unknown timezone: {value}") from exc
        return value

    @model_validator(mode="after")
    def _validate_choices(self):
        if self.password != self.password_confirmation:
            raise ValueError("Passwords do not match.")
        if self.telegram_configured:
            if not self.telegram_bot_token.strip() or not self.telegram_chat_id.strip():
                raise ValueError(
                    "Telegram bot token and chat ID are required unless Telegram is skipped."
                )
        if self.llm_configured:
            if not self.llm_model.strip() or not self.llm_base_url.strip():
                raise ValueError(
                    "Local AI provider, model, base URL, and request timeout are required "
                    "unless local AI is skipped."
                )
            self.llm_base_url = validate_local_base_url(self.llm_base_url)
        return self


class SetupCompleteResult(BaseModel):
    completed: Literal[True] = True


class SetupTelegramTestRequest(BaseModel):
    telegram_bot_token: str = Field(min_length=1, max_length=200)
    telegram_chat_id: str = Field(min_length=1, max_length=64)
