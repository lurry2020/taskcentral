from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.settings import LLMTestRequest, LLMTestResult, TelegramTestResult
from app.schemas.setup import (
    SetupCompleteRequest,
    SetupCompleteResult,
    SetupStatus,
    SetupTelegramTestRequest,
)
from app.services.llm import LocalLLMConfig, LocalLLMError, test_local_llm
from app.services.setup import complete_setup, is_setup_complete, require_setup_incomplete
from app.services.telegram import send_telegram_message

router = APIRouter(prefix="/setup", tags=["setup"])


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
        return LLMTestResult(ok=False, message=str(exc))


@router.post("/complete", response_model=SetupCompleteResult)
def finish_setup(payload: SetupCompleteRequest, db: Session = Depends(get_db)):
    complete_setup(db, payload)
    return SetupCompleteResult()
