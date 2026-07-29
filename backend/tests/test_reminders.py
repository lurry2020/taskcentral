import json
from datetime import date, timedelta


def test_create_generates_reminders(client, machine):
    reminders = client.get(f"/api/v1/machines/{machine['id']}/reminders").json()
    titles = [r["title"] for r in reminders]
    assert "Apply OS updates" in titles  # ALL-scoped
    assert "Prune VM snapshots" in titles  # VM-scoped
    # New machine reminders start with no last-performed and a future due date
    os_update = next(r for r in reminders if r["title"] == "Apply OS updates")
    assert os_update["last_performed_at"] is None
    assert os_update["next_due_at"] is not None
    assert os_update["is_custom"] is False


def test_network_gets_network_reminders_only(client):
    net = client.post(
        "/api/v1/machines", json={"name": "home-net", "machine_type": "NETWORK"}
    ).json()
    titles = [r["title"] for r in client.get(f"/api/v1/machines/{net['id']}/reminders").json()]
    assert "Update router / controller firmware" in titles
    assert "Apply OS updates" not in titles  # ALL-scoped must not apply to NETWORK


def test_mark_done_advances_due_date(client, machine):
    reminder = client.get(f"/api/v1/machines/{machine['id']}/reminders").json()[0]
    resp = client.post(
        f"/api/v1/machines/{machine['id']}/reminders/{reminder['id']}/mark-done"
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["last_performed_at"] == date.today().isoformat()
    expected = (date.today() + timedelta(days=updated["interval_days"])).isoformat()
    assert updated["next_due_at"] == expected


def test_edit_last_performed_recomputes_due(client, machine):
    reminder = client.get(f"/api/v1/machines/{machine['id']}/reminders").json()[0]
    last = date(2026, 1, 1)
    resp = client.patch(
        f"/api/v1/machines/{machine['id']}/reminders/{reminder['id']}",
        json={"last_performed_at": last.isoformat(), "interval_days": 30},
    )
    assert resp.status_code == 200
    assert resp.json()["next_due_at"] == (last + timedelta(days=30)).isoformat()


def test_custom_reminder_add_delete_rules(client, machine):
    resp = client.post(
        f"/api/v1/machines/{machine['id']}/reminders",
        json={"title": "Renew TLS cert", "interval_days": 60},
    )
    assert resp.status_code == 201
    custom = resp.json()
    assert custom["is_custom"] is True
    assert client.delete(
        f"/api/v1/machines/{machine['id']}/reminders/{custom['id']}"
    ).status_code == 204
    # Template reminders cannot be deleted
    tmpl = client.get(f"/api/v1/machines/{machine['id']}/reminders").json()[0]
    assert client.delete(
        f"/api/v1/machines/{machine['id']}/reminders/{tmpl['id']}"
    ).status_code == 400


def test_reminder_templates_crud(client):
    templates = client.get("/api/v1/reminder-templates").json()
    assert len(templates) >= 20
    resp = client.post(
        "/api/v1/reminder-templates",
        json={"title": "Custom check", "machine_type_scope": "VM", "interval_days": 45},
    )
    assert resp.status_code == 201
    tid = resp.json()["id"]
    assert client.delete(f"/api/v1/reminder-templates/{tid}").status_code == 204


def test_apply_templates_no_duplicates(client, machine):
    preview = client.get(
        f"/api/v1/machines/{machine['id']}/reminders/apply-templates/preview"
    ).json()
    assert preview["reminders"] == []  # already fully applied at creation
    # Add a new VM template → it becomes appliable
    client.post(
        "/api/v1/reminder-templates",
        json={"title": "Extra VM reminder", "machine_type_scope": "VM", "interval_days": 10},
    )
    preview = client.get(
        f"/api/v1/machines/{machine['id']}/reminders/apply-templates/preview"
    ).json()
    assert [r["title"] for r in preview["reminders"]] == ["Extra VM reminder"]
    applied = client.post(f"/api/v1/machines/{machine['id']}/reminders/apply-templates").json()
    assert len(applied["added"]) == 1


def test_run_reminder_check_sends_for_due(db_session, monkeypatch):
    import app.services.alerts as alerts

    from app.models import ApplicationSetting, Machine, MachineReminder

    db = db_session()
    for key, value in {
        "reminder_alerts_enabled": True,
        "telegram_bot_token": "token",
        "telegram_chat_id": "chat",
        "timezone": "UTC",
        "reminder_send_time": "00:00",  # always past, so the send-time gate is open
    }.items():
        row = db.get(ApplicationSetting, key)
        row.value = json.dumps(value)

    m = Machine(name="due-vm", machine_type="VM", status="Active")
    db.add(m)
    db.flush()
    due = MachineReminder(
        machine_id=m.id,
        title="Apply OS updates",
        interval_days=7,
        enabled=True,
        next_due_at=date.today() - timedelta(days=1),
    )
    db.add(due)
    db.commit()

    sent = []
    monkeypatch.setattr(alerts, "SessionLocal", db_session)
    monkeypatch.setattr(
        alerts, "send_telegram_message", lambda t, c, text: sent.append(text) or (True, "ok")
    )
    alerts.run_reminder_check()

    assert len(sent) == 1
    assert "Apply OS updates" in sent[0]
    db.refresh(due)
    assert due.last_notified_due_at == due.next_due_at
    # A second run does not re-ping the same cycle
    alerts.run_reminder_check()
    assert len(sent) == 1
    db.close()


def test_reminder_send_time_gate(db_session, monkeypatch):
    import app.services.alerts as alerts

    from app.models import ApplicationSetting, Machine, MachineReminder

    db = db_session()
    for key, value in {
        "reminder_alerts_enabled": True,
        "telegram_bot_token": "token",
        "telegram_chat_id": "chat",
        "timezone": "UTC",
        "reminder_send_time": "23:59",  # almost certainly still in the future today
    }.items():
        db.get(ApplicationSetting, key).value = json.dumps(value)
    m = Machine(name="gated-vm", machine_type="VM", status="Active")
    db.add(m)
    db.flush()
    db.add(
        MachineReminder(
            machine_id=m.id,
            title="Apply OS updates",
            interval_days=7,
            enabled=True,
            next_due_at=date.today() - timedelta(days=1),
        )
    )
    db.commit()

    sent = []
    monkeypatch.setattr(alerts, "SessionLocal", db_session)
    monkeypatch.setattr(alerts, "send_telegram_message", lambda t, c, x: sent.append(x) or (True, "ok"))
    # Force "now" to 08:00 UTC — before the 23:59 send time → nothing sent.
    from datetime import datetime as real_datetime, timezone as tz

    class FrozenDatetime(real_datetime):
        @classmethod
        def now(cls, tzinfo=None):
            return real_datetime(2026, 7, 26, 8, 0, tzinfo=tzinfo or tz.utc)

    monkeypatch.setattr(alerts, "datetime", FrozenDatetime)
    alerts.run_reminder_check()
    assert sent == []
    db.close()


def test_parse_send_time():
    from datetime import time

    from app.services.alerts import _parse_send_time

    assert _parse_send_time("09:30") == time(9, 30)
    assert _parse_send_time(None) == time(9, 0)
    assert _parse_send_time("garbage") == time(9, 0)
