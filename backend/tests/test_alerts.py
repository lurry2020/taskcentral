from datetime import datetime, timedelta, timezone

from app.models import Machine, MachineTask
from app.services.alerts import build_alert_text, count_pending_tasks


def test_build_alert_text_pluralization():
    assert build_alert_text(1) == "You have 1 pending task that needs attention in Task Central"
    assert build_alert_text(3) == "You have 3 pending tasks that need attention in Task Central"


def test_count_pending_tasks_respects_threshold_and_status(db_session):
    db = db_session()
    now = datetime.now(timezone.utc)
    old = now - timedelta(hours=48)

    machine = Machine(name="alert-vm", machine_type="VM", status="In Progress")
    db.add(machine)
    db.flush()

    # Stale pending + stale in-progress → counted
    db.add(MachineTask(machine_id=machine.id, title="stale pending", status="Pending",
                       created_at=old, updated_at=old))
    db.add(MachineTask(machine_id=machine.id, title="stale in progress", status="In Progress",
                       created_at=old, updated_at=old))
    # Recent pending → not counted (under threshold)
    db.add(MachineTask(machine_id=machine.id, title="recent pending", status="Pending",
                       created_at=now, updated_at=now))
    # Stale but done / NA → not counted
    db.add(MachineTask(machine_id=machine.id, title="stale done", status="Completed",
                       created_at=old, updated_at=old))
    db.add(MachineTask(machine_id=machine.id, title="stale n/a", status="Not Applicable",
                       created_at=old, updated_at=old))

    # Archived machine's stale pending task → not counted
    archived = Machine(name="archived-vm", machine_type="VM", status="Archived",
                       archived_at=now)
    db.add(archived)
    db.flush()
    db.add(MachineTask(machine_id=archived.id, title="archived pending", status="Pending",
                       created_at=old, updated_at=old))
    db.commit()

    assert count_pending_tasks(db, threshold_hours=24) == 2
    # A very long threshold excludes the 48h-old tasks
    assert count_pending_tasks(db, threshold_hours=168) == 0
    db.close()


def test_settings_expose_alert_fields(client):
    s = client.get("/api/v1/settings").json()
    assert s["alerts_enabled"] is False
    assert s["pending_task_threshold_hours"] == 24
    assert s["alert_frequency_hours"] == 24
    assert s["telegram_bot_token"] == ""
    assert s["telegram_chat_id"] == ""
    # Round-trips through the update endpoint
    resp = client.put(
        "/api/v1/settings",
        json={"alerts_enabled": True, "alert_frequency_hours": 12, "telegram_chat_id": "42"},
    )
    body = resp.json()
    assert body["alerts_enabled"] is True
    assert body["alert_frequency_hours"] == 12
    assert body["telegram_chat_id"] == "42"


def test_test_telegram_endpoint(client, monkeypatch):
    # No credentials → clean failure, no network
    resp = client.post("/api/v1/settings/test-telegram", json={})
    assert resp.status_code == 200
    assert resp.json()["ok"] is False

    # Monkeypatch the sender so we don't hit the network
    import app.routers.settings_router as sr

    monkeypatch.setattr(sr, "send_telegram_message", lambda token, chat, text: (True, "Message sent."))
    resp = client.post(
        "/api/v1/settings/test-telegram",
        json={"telegram_bot_token": "t", "telegram_chat_id": "c"},
    )
    assert resp.json() == {"ok": True, "message": "Message sent."}
