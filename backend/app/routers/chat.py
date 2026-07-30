import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.llm import LocalLLMError, chat_with_local_llm, config_from_settings
from app.services.rendering import load_settings

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


@router.post("", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    settings = load_settings(db)
    if not settings.get("llm_enabled"):
        raise HTTPException(
            status_code=409,
            detail="Local AI chat is disabled. Configure and enable it in Settings.",
        )
    try:
        config = config_from_settings(settings)
        messages = [message.model_dump() for message in payload.messages]
        content = chat_with_local_llm(config, messages, payload.context_path)
    except ValueError as exc:
        logger.warning("Local AI chat configuration is invalid: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LocalLLMError as exc:
        logger.error("Local AI chat failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ChatResponse(content=content, model=config.model, provider=config.provider)
