import json

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.database import build_engine
from app.models import ApplicationSetting, Base, MachineTask, TaskTemplate
from app.schemas.setup import SetupCompleteRequest
from app.services.auth import check_credentials, get_stored_password_hash
from app.services.seed import seed_all
from app.services.setup import (
    SETUP_COMPLETED_KEY,
    complete_setup,
    initialize_setup_state,
    is_setup_complete,
)


def _payload(**overrides):
    values = {
        "username": "setup-admin",
        "password": "new-password",
        "password_confirmation": "new-password",
        "timezone": "Europe/London",
        "date_format": "DD.MM.YYYY",
        "telegram_configured": True,
        "telegram_bot_token": "bot-token",
        "telegram_chat_id": "123456",
        "llm_configured": True,
        "llm_provider": "ollama",
        "llm_base_url": "http://host.docker.internal:11434",
        "llm_model": "llama3.2:3b",
        "llm_api_key": "",
        "llm_timeout_seconds": 120,
    }
    values.update(overrides)
    return SetupCompleteRequest(**values)


def test_new_database_setup_is_atomic_and_preserves_seed_data():
    engine = build_engine("sqlite://")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = Session()
    try:
        seed_all(db)
        assert is_setup_complete(db) is False
        templates_before = db.scalar(select(func.count()).select_from(TaskTemplate))
        tasks_before = db.scalar(select(func.count()).select_from(MachineTask))

        complete_setup(db, _payload())

        assert is_setup_complete(db) is True
        assert check_credentials(db, "setup-admin", "new-password") is True
        assert check_credentials(db, "legacy-user", "new-password") is False
        assert json.loads(db.get(ApplicationSetting, "auth_username").value) == "setup-admin"
        assert json.loads(db.get(ApplicationSetting, "timezone").value) == "Europe/London"
        assert json.loads(db.get(ApplicationSetting, "date_format").value) == "DD.MM.YYYY"
        assert json.loads(db.get(ApplicationSetting, "telegram_bot_token").value) == "bot-token"
        assert json.loads(db.get(ApplicationSetting, "llm_enabled").value) is True
        assert json.loads(db.get(ApplicationSetting, "llm_model").value) == "llama3.2:3b"
        assert db.scalar(select(func.count()).select_from(TaskTemplate)) == templates_before
        assert db.scalar(select(func.count()).select_from(MachineTask)) == tasks_before

        password_hash = get_stored_password_hash(db)
        with pytest.raises(HTTPException) as exc_info:
            complete_setup(db, _payload(password="another-pass", password_confirmation="another-pass"))
        assert exc_info.value.status_code == 409
        assert get_stored_password_hash(db) == password_hash
    finally:
        db.close()
        engine.dispose()


def test_legacy_install_is_marked_complete_without_changing_preferences():
    engine = build_engine("sqlite://")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = Session()
    try:
        db.add(
            TaskTemplate(
                title="Existing template",
                category="Other",
                machine_type_scope="ALL",
                required=True,
                enabled=True,
                sort_order=10,
            )
        )
        db.commit()

        assert initialize_setup_state(db) is True
        db.commit()

        assert is_setup_complete(db) is True
        assert db.scalar(select(TaskTemplate.title)) == "Existing template"
        assert json.loads(db.get(ApplicationSetting, SETUP_COMPLETED_KEY).value) is True
    finally:
        db.close()
        engine.dispose()


def test_setup_validation_enforces_password_and_optional_step_requirements():
    with pytest.raises(ValidationError, match="Username is required"):
        _payload(username="   ")
    with pytest.raises(ValidationError, match="at least 6 characters"):
        _payload(password="short", password_confirmation="short")
    with pytest.raises(ValidationError, match="Passwords do not match"):
        _payload(password_confirmation="different")
    with pytest.raises(ValidationError, match="Telegram bot token and chat ID"):
        _payload(telegram_chat_id="")
    with pytest.raises(ValidationError, match="Local AI provider, model, base URL"):
        _payload(llm_model="")

    skipped = _payload(
        telegram_configured=False,
        telegram_bot_token="",
        telegram_chat_id="",
        llm_configured=False,
        llm_model="",
        llm_base_url="",
    )
    assert skipped.telegram_configured is False
    assert skipped.llm_configured is False


def test_skipped_integrations_keep_safe_defaults():
    engine = build_engine("sqlite://")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = Session()
    try:
        seed_all(db)
        payload = _payload(
            telegram_configured=False,
            telegram_bot_token="",
            telegram_chat_id="",
            llm_configured=False,
            llm_model="",
            llm_base_url="",
        )

        complete_setup(db, payload)

        assert json.loads(db.get(ApplicationSetting, "telegram_bot_token").value) == ""
        assert json.loads(db.get(ApplicationSetting, "telegram_chat_id").value) == ""
        assert json.loads(db.get(ApplicationSetting, "llm_enabled").value) is False
        assert is_setup_complete(db) is True
    finally:
        db.close()
        engine.dispose()


def test_setup_api_is_single_use(client, db_session):
    db = db_session()
    db.get(ApplicationSetting, SETUP_COMPLETED_KEY).value = json.dumps(False)
    db.commit()
    db.close()

    assert client.get("/api/v1/setup/status").json() == {
        "completed": False,
        "required": True,
    }
    response = client.post("/api/v1/setup/complete", json=_payload().model_dump())
    assert response.status_code == 200
    assert response.json() == {"completed": True}
    assert client.get("/api/v1/setup/status").json()["completed"] is True
    assert client.post("/api/v1/setup/complete", json=_payload().model_dump()).status_code == 409


def test_login_is_blocked_until_setup_is_complete(client, db_session):
    db = db_session()
    db.get(ApplicationSetting, SETUP_COMPLETED_KEY).value = json.dumps(False)
    db.commit()
    db.close()

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "change-me-on-first-run"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Complete initial setup before signing in."
