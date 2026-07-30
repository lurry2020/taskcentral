import json
import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApplicationSetting
from app.schemas.settings import (
    SettingsOut,
    SettingsUpdate,
    LLMModelsRequest,
    LLMModelsResult,
    LLMTestRequest,
    LLMTestResult,
    TelegramTestRequest,
    TelegramTestResult,
)
from app.services.rendering import load_settings
from app.services.seed import seed_obsidian_templates
from app.services.telegram import send_telegram_message
from app.services.llm import (
    LocalLLMConfig,
    LocalLLMError,
    list_local_llm_models,
    test_local_llm,
)

router = APIRouter(prefix="/settings", tags=["settings"])
logger = logging.getLogger(__name__)


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return SettingsOut(**{k: v for k, v in load_settings(db).items() if k in SettingsOut.model_fields})


@router.put("", response_model=SettingsOut)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    for key, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        if hasattr(value, "value"):
            value = value.value
        row = db.get(ApplicationSetting, key)
        if row is None:
            db.add(ApplicationSetting(key=key, value=json.dumps(value)))
        else:
            row.value = json.dumps(value)
    db.commit()
    return get_settings(db)


@router.post("/test-telegram", response_model=TelegramTestResult)
def test_telegram(payload: TelegramTestRequest, db: Session = Depends(get_db)):
    """Send a test message using the supplied (possibly unsaved) credentials,
    falling back to the stored ones when a field is omitted."""
    stored = load_settings(db)
    token = payload.telegram_bot_token
    if token is None:
        token = stored.get("telegram_bot_token", "")
    chat_id = payload.telegram_chat_id
    if chat_id is None:
        chat_id = stored.get("telegram_chat_id", "")
    ok, message = send_telegram_message(
        token,
        chat_id,
        "✅ Test alert from Task Central — your Telegram integration is working.",
    )
    return TelegramTestResult(ok=ok, message=message)


@router.post("/test-llm", response_model=LLMTestResult)
def test_llm(payload: LLMTestRequest):
    config = LocalLLMConfig(
        provider=payload.llm_provider,
        base_url=payload.llm_base_url,
        model=payload.llm_model.strip(),
        api_key=payload.llm_api_key.strip(),
        timeout_seconds=payload.llm_timeout_seconds,
        include_manual=False,
    )
    try:
        reply = test_local_llm(config)
        return LLMTestResult(ok=True, message="Local AI connection succeeded.", reply=reply)
    except (LocalLLMError, ValueError) as exc:
        logger.warning("Local AI connection test failed: %s", exc)
        return LLMTestResult(ok=False, message=str(exc))


@router.post("/llm-models", response_model=LLMModelsResult)
def llm_models(payload: LLMModelsRequest):
    config = LocalLLMConfig(
        provider=payload.llm_provider,
        base_url=payload.llm_base_url,
        model="",
        api_key=payload.llm_api_key.strip(),
        timeout_seconds=min(payload.llm_timeout_seconds, 30),
        include_manual=False,
    )
    try:
        models = list_local_llm_models(config)
        message = (
            f"Found {len(models)} local model{'s' if len(models) != 1 else ''}."
            if models
            else "No installed models were reported by the local AI server."
        )
        return LLMModelsResult(ok=True, message=message, models=models)
    except (LocalLLMError, ValueError) as exc:
        logger.warning("Local AI model discovery failed: %s", exc)
        return LLMModelsResult(ok=False, message=str(exc))


@router.post("/restore-default-templates")
def restore_default_templates(db: Session = Depends(get_db)):
    count = seed_obsidian_templates(db, replace=True)
    db.commit()
    return {"restored": count}
