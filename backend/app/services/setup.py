"""First-run setup state and atomic application of the setup wizard."""

import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ApplicationSetting,
    Machine,
    ObsidianTemplate,
    ReminderTemplate,
    TaskTemplate,
)
from app.services.auth import set_login_username, set_password

SETUP_COMPLETED_KEY = "setup_completed"


def _has_existing_install_data(db: Session) -> bool:
    return any(
        db.scalar(select(model_id).limit(1)) is not None
        for model_id in (
            ApplicationSetting.key,
            Machine.id,
            TaskTemplate.id,
            ReminderTemplate.id,
            ObsidianTemplate.id,
        )
    )


def _write_setting(db: Session, key: str, value: object) -> None:
    encoded = json.dumps(value)
    row = db.get(ApplicationSetting, key)
    if row is None:
        db.add(ApplicationSetting(key=key, value=encoded))
    else:
        row.value = encoded


def is_setup_complete(db: Session) -> bool:
    """Return the persisted setup state.

    A missing flag on a database that already contains settings or primary
    application records is treated as a completed legacy installation. This
    prevents an upgrade from ever exposing the first-run wizard before startup
    has added the flag.
    """
    row = db.get(ApplicationSetting, SETUP_COMPLETED_KEY)
    if row is None:
        return _has_existing_install_data(db)
    try:
        return json.loads(row.value) is True
    except (TypeError, ValueError, json.JSONDecodeError):
        return False


def initialize_setup_state(db: Session) -> bool:
    """Create the setup flag without changing any existing preference.

    This runs before defaults are seeded. An empty database is a new
    installation and starts incomplete; a database with existing settings,
    machines, or templates is an upgraded installation and starts complete.
    """
    row = db.get(ApplicationSetting, SETUP_COMPLETED_KEY)
    if row is not None:
        return is_setup_complete(db)
    existing_install = _has_existing_install_data(db)
    db.add(
        ApplicationSetting(
            key=SETUP_COMPLETED_KEY,
            value=json.dumps(existing_install),
        )
    )
    return existing_install


def require_setup_incomplete(db: Session) -> None:
    if is_setup_complete(db):
        raise HTTPException(status_code=409, detail="Initial setup has already been completed.")


def complete_setup(db: Session, payload) -> None:
    """Apply all wizard choices and close setup in one database transaction."""
    require_setup_incomplete(db)
    try:
        set_login_username(db, payload.username)
        set_password(db, payload.password)
        _write_setting(db, "timezone", payload.timezone)
        _write_setting(db, "date_format", payload.date_format)

        if payload.telegram_configured:
            _write_setting(db, "telegram_bot_token", payload.telegram_bot_token.strip())
            _write_setting(db, "telegram_chat_id", payload.telegram_chat_id.strip())

        if payload.llm_configured:
            _write_setting(db, "llm_enabled", True)
            _write_setting(db, "llm_provider", payload.llm_provider)
            _write_setting(db, "llm_base_url", payload.llm_base_url)
            _write_setting(db, "llm_model", payload.llm_model.strip())
            _write_setting(db, "llm_api_key", payload.llm_api_key.strip())
            _write_setting(db, "llm_timeout_seconds", payload.llm_timeout_seconds)

        # Write this last so a failed transaction can never leave setup closed
        # with only part of the requested configuration applied.
        _write_setting(db, SETUP_COMPLETED_KEY, True)
        db.commit()
    except Exception:
        db.rollback()
        raise
