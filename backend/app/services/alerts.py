"""Pending-task alerting: periodically notify (via Telegram) about tasks that have
been sitting in a pending state longer than a configurable threshold."""

import asyncio
import json
import logging
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import ApplicationSetting, Machine, MachineTask
from app.services.activity import log_event
from app.services.reminders import due_reminders
from app.services.rendering import _resolve_tz, load_settings
from app.services.telegram import send_telegram_message

logger = logging.getLogger(__name__)

LAST_SENT_KEY = "last_alert_sent_at"
PENDING_STATUSES = ("Pending", "In Progress")
TICK_SECONDS = 60


def count_pending_tasks(db: Session, threshold_hours: int) -> int:
    """Pending/in-progress tasks on active machines, unchanged for >= threshold."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, threshold_hours))
    return (
        db.scalar(
            select(func.count(MachineTask.id))
            .join(Machine, MachineTask.machine_id == Machine.id)
            .where(Machine.archived_at.is_(None))
            .where(MachineTask.status.in_(PENDING_STATUSES))
            .where(MachineTask.updated_at < cutoff)
        )
        or 0
    )


def build_alert_text(count: int) -> str:
    noun = "task" if count == 1 else "tasks"
    verb = "needs" if count == 1 else "need"
    return f"You have {count} pending {noun} that {verb} attention in Task Central"


def _get_last_sent(db: Session) -> datetime | None:
    row = db.get(ApplicationSetting, LAST_SENT_KEY)
    if row is None:
        return None
    try:
        parsed = datetime.fromisoformat(json.loads(row.value))
    except Exception:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _set_last_sent(db: Session, when: datetime) -> None:
    value = json.dumps(when.isoformat())
    row = db.get(ApplicationSetting, LAST_SENT_KEY)
    if row is None:
        db.add(ApplicationSetting(key=LAST_SENT_KEY, value=value))
    else:
        row.value = value


def run_alert_check() -> None:
    """One evaluation cycle: send a Telegram alert if due and there are stale tasks."""
    db = SessionLocal()
    try:
        settings = load_settings(db)
        if not settings.get("alerts_enabled"):
            return
        token = (settings.get("telegram_bot_token") or "").strip()
        chat_id = (settings.get("telegram_chat_id") or "").strip()
        if not token or not chat_id:
            return

        frequency = int(settings.get("alert_frequency_hours") or 24)
        now = datetime.now(timezone.utc)
        last = _get_last_sent(db)
        if last is not None and now - last < timedelta(hours=frequency):
            return

        threshold = int(settings.get("pending_task_threshold_hours") or 24)
        count = count_pending_tasks(db, threshold)
        if count <= 0:
            return

        ok, message = send_telegram_message(token, chat_id, build_alert_text(count))
        if ok:
            _set_last_sent(db, now)
            log_event(db, "alert_sent", f"Telegram alert sent: {count} pending task(s).")
            db.commit()
        else:
            logger.warning("Pending-task alert failed to send: %s", message)
    except Exception:  # never let the loop die on a bad cycle
        logger.exception("Alert check cycle failed")
    finally:
        db.close()


def _parse_send_time(value: str | None) -> time:
    try:
        hh, mm = (value or "09:00").split(":")
        return time(int(hh), int(mm))
    except Exception:
        return time(9, 0)


def run_reminder_check() -> None:
    """Send a Telegram ping for each due reminder, once per cycle, at/after the
    configured daily send time in the app's timezone."""
    db = SessionLocal()
    try:
        settings = load_settings(db)
        if not settings.get("reminder_alerts_enabled"):
            return
        token = (settings.get("telegram_bot_token") or "").strip()
        chat_id = (settings.get("telegram_chat_id") or "").strip()
        if not token or not chat_id:
            return

        # "Today" and the send-time gate both use the configured timezone.
        now_local = datetime.now(_resolve_tz(settings.get("timezone")))
        if now_local.time() < _parse_send_time(settings.get("reminder_send_time")):
            return  # too early in the day to send

        today = now_local.date()
        for reminder in due_reminders(db, today):
            if reminder.last_notified_due_at == reminder.next_due_at:
                continue  # already pinged for this cycle
            machine = reminder.machine
            last = (
                reminder.last_performed_at.isoformat() if reminder.last_performed_at else "never"
            )
            overdue_days = (today - reminder.next_due_at).days
            when = "due today" if overdue_days <= 0 else f"{overdue_days} day(s) overdue"
            text = (
                f"⏰ Reminder ({when}): {reminder.title}\n"
                f"Machine: {machine.name}\n"
                f"Last done: {last}"
            )
            ok, message = send_telegram_message(token, chat_id, text)
            if ok:
                reminder.last_notified_due_at = reminder.next_due_at
                log_event(
                    db,
                    "reminder_alert_sent",
                    f'Reminder alert sent: "{reminder.title}".',
                    reminder.machine_id,
                )
                db.commit()
            else:
                logger.warning("Reminder alert failed to send: %s", message)
    except Exception:
        logger.exception("Reminder check cycle failed")
    finally:
        db.close()


async def alert_loop() -> None:
    """Background loop; evaluates alerts every TICK_SECONDS off the event loop thread."""
    logger.info("Pending-task + reminder alert loop started (tick=%ss)", TICK_SECONDS)
    while True:
        await asyncio.sleep(TICK_SECONDS)
        await asyncio.to_thread(run_alert_check)
        await asyncio.to_thread(run_reminder_check)
