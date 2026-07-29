import json

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.database import build_engine
from app.models import (
    ActivityEvent,
    ApplicationSetting,
    Base,
    Machine,
    MachineTask,
    ObsidianTemplate,
    ReminderTemplate,
    Service,
    TaskTemplate,
)
from app.schemas.setup import SetupCompleteRequest
from app.services.auth import get_stored_password_hash
from app.services.reset import reset_application
from app.services.seed import seed_all
from app.services.setup import complete_setup, is_setup_complete


def _database():
    engine = build_engine("sqlite://")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    return engine, session_factory()


def _setup_payload():
    return SetupCompleteRequest(
        username="reset-admin",
        password="reset-password",
        password_confirmation="reset-password",
        timezone="Asia/Tokyo",
        date_format="DD.MM.YYYY",
        telegram_configured=True,
        telegram_bot_token="secret-token",
        telegram_chat_id="123456",
        llm_configured=True,
        llm_provider="ollama",
        llm_base_url="http://host.docker.internal:11434",
        llm_model="local-model",
        llm_api_key="secret-api-key",
        llm_timeout_seconds=120,
    )


def test_reset_deletes_user_data_and_returns_to_first_run_defaults():
    engine, db = _database()
    try:
        seed_all(db)
        factory_counts = {
            TaskTemplate: db.scalar(select(func.count()).select_from(TaskTemplate)),
            ReminderTemplate: db.scalar(select(func.count()).select_from(ReminderTemplate)),
            ObsidianTemplate: db.scalar(select(func.count()).select_from(ObsidianTemplate)),
        }
        complete_setup(db, _setup_payload())

        machine = Machine(name="Delete me", machine_type="VM", status="Active")
        db.add(machine)
        db.flush()
        db.add_all(
            [
                Service(machine_id=machine.id, name="Temporary service"),
                MachineTask(
                    machine_id=machine.id,
                    title="Temporary task",
                    category="Other",
                    status="Pending",
                    required=False,
                    is_custom=True,
                    sort_order=10,
                ),
                ActivityEvent(
                    machine_id=machine.id,
                    event_type="test",
                    description="Temporary activity",
                ),
            ]
        )
        db.commit()

        reset_application(db)

        for model in (Machine, Service, MachineTask, ActivityEvent):
            assert db.scalar(select(func.count()).select_from(model)) == 0

        assert is_setup_complete(db) is False
        assert db.get(ApplicationSetting, "auth_username") is None
        assert get_stored_password_hash(db) is None
        assert json.loads(db.get(ApplicationSetting, "timezone").value) == "America/New_York"
        assert json.loads(db.get(ApplicationSetting, "telegram_bot_token").value) == ""
        assert json.loads(db.get(ApplicationSetting, "llm_enabled").value) is False
        assert json.loads(db.get(ApplicationSetting, "llm_api_key").value) == ""

        assert db.scalar(select(func.count()).select_from(TaskTemplate)) == factory_counts[
            TaskTemplate
        ]
        assert db.scalar(select(func.count()).select_from(ReminderTemplate)) == factory_counts[
            ReminderTemplate
        ]
        assert db.scalar(select(func.count()).select_from(ObsidianTemplate)) == factory_counts[
            ObsidianTemplate
        ]
    finally:
        db.close()
        engine.dispose()


def test_reset_rolls_back_if_reseeding_fails(monkeypatch):
    engine, db = _database()
    try:
        seed_all(db)
        complete_setup(db, _setup_payload())
        db.add(Machine(name="Must survive", machine_type="VM", status="Active"))
        db.commit()
        password_hash = get_stored_password_hash(db)

        def fail_seed(_db):
            raise RuntimeError("seed failed")

        monkeypatch.setattr("app.services.reset.seed_all", fail_seed)
        with pytest.raises(RuntimeError, match="seed failed"):
            reset_application(db)

        assert db.scalar(select(Machine.name)) == "Must survive"
        assert get_stored_password_hash(db) == password_hash
        assert is_setup_complete(db) is True
    finally:
        db.close()
        engine.dispose()
