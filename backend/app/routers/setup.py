import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.settings import (
    LLMModelsRequest,
    LLMModelsResult,
    LLMTestRequest,
    LLMTestResult,
    TelegramTestResult,
)
from app.schemas.setup import (
    SetupCompleteRequest,
    SetupCompleteResult,
    SetupStatus,
    SetupTelegramTestRequest,
)
from app.services.llm import (
    LocalLLMConfig,
    LocalLLMError,
    list_local_llm_models,
    test_local_llm,
)
from app.services.setup import complete_setup, is_setup_complete, require_setup_incomplete
from app.services.telegram import send_telegram_message

router = APIRouter(prefix="/setup", tags=["setup"])
logger = logging.getLogger(__name__)


@router.get("/status", response_model=SetupStatus)
def setup_status(db: Session = Depends(get_db)):
    completed = is_setup_complete(db)
    return SetupStatus(completed=completed, required=not completed)


@router.post("/test-telegram", response_model=TelegramTestResult)
def test_setup_telegram(
    payload: SetupTelegramTestRequest,
    db: Session = Depends(get_db),
):
    require_setup_incomplete(db)
    ok, message = send_telegram_message(
        payload.telegram_bot_token,
        payload.telegram_chat_id,
        "✅ Test message from the Task Central setup wizard.",
    )
    return TelegramTestResult(ok=ok, message=message)


@router.post("/test-llm", response_model=LLMTestResult)
def test_setup_llm(payload: LLMTestRequest, db: Session = Depends(get_db)):
    require_setup_incomplete(db)
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
        logger.warning("Setup local AI connection test failed: %s", exc)
        return LLMTestResult(ok=False, message=str(exc))


@router.post("/llm-models", response_model=LLMModelsResult)
def setup_llm_models(payload: LLMModelsRequest, db: Session = Depends(get_db)):
    require_setup_incomplete(db)
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
        logger.warning("Setup local AI model discovery failed: %s", exc)
        return LLMModelsResult(ok=False, message=str(exc))


@router.post("/complete", response_model=SetupCompleteResult)
def finish_setup(payload: SetupCompleteRequest, db: Session = Depends(get_db)):
    complete_setup(db, payload)
    return SetupCompleteResult()
