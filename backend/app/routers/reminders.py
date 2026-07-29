from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MachineReminder
from app.routers.helpers import get_machine_or_404
from app.schemas.reminder import (
    ApplyRemindersPreview,
    ApplyRemindersResult,
    MachineReminderCreate,
    MachineReminderOut,
    MachineReminderUpdate,
)
from app.services.activity import log_event
from app.services.reminders import (
    apply_missing_reminders,
    compute_next_due,
    missing_reminder_templates,
)

router = APIRouter(tags=["reminders"])


def _get_reminder(db: Session, machine_id: int, reminder_id: int) -> MachineReminder:
    reminder = db.get(MachineReminder, reminder_id)
    if reminder is None or reminder.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return reminder


@router.get("/machines/{machine_id}/reminders", response_model=list[MachineReminderOut])
def list_reminders(machine_id: int, db: Session = Depends(get_db)):
    get_machine_or_404(db, machine_id)
    return list(
        db.scalars(
            select(MachineReminder)
            .where(MachineReminder.machine_id == machine_id)
            # Most urgent first; undated (disabled/unset) last.
            .order_by(
                MachineReminder.next_due_at.is_(None),
                MachineReminder.next_due_at,
                MachineReminder.sort_order,
                MachineReminder.id,
            )
        )
    )


@router.post("/machines/{machine_id}/reminders", response_model=MachineReminderOut, status_code=201)
def create_reminder(machine_id: int, payload: MachineReminderCreate, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    max_order = max((r.sort_order for r in machine.reminders), default=0)
    next_due = payload.next_due_at or compute_next_due(payload.last_performed_at, payload.interval_days)
    reminder = MachineReminder(
        machine_id=machine_id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        interval_days=payload.interval_days,
        last_performed_at=payload.last_performed_at,
        next_due_at=next_due,
        enabled=payload.enabled,
        notes=payload.notes,
        is_custom=True,
        sort_order=max_order + 10,
    )
    db.add(reminder)
    log_event(db, "reminder_added", f'Custom reminder "{reminder.title}" added.', machine_id)
    db.commit()
    db.refresh(reminder)
    return reminder


@router.patch("/machines/{machine_id}/reminders/{reminder_id}", response_model=MachineReminderOut)
def update_reminder(
    machine_id: int, reminder_id: int, payload: MachineReminderUpdate, db: Session = Depends(get_db)
):
    reminder = _get_reminder(db, machine_id, reminder_id)
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(reminder, key, value)
    # Editing the last-performed date or interval (without an explicit next-due)
    # recomputes when the next reminder should fire.
    if "next_due_at" not in data and ("last_performed_at" in data or "interval_days" in data):
        reminder.next_due_at = compute_next_due(reminder.last_performed_at, reminder.interval_days)
    if "next_due_at" in data or "last_performed_at" in data:
        reminder.last_notified_due_at = None  # a rescheduled reminder can ping again
    db.commit()
    db.refresh(reminder)
    return reminder


@router.post(
    "/machines/{machine_id}/reminders/{reminder_id}/mark-done", response_model=MachineReminderOut
)
def mark_reminder_done(machine_id: int, reminder_id: int, db: Session = Depends(get_db)):
    reminder = _get_reminder(db, machine_id, reminder_id)
    today = date.today()
    reminder.last_performed_at = today
    reminder.next_due_at = compute_next_due(today, reminder.interval_days)
    reminder.last_notified_due_at = None
    log_event(
        db,
        "reminder_done",
        f'Reminder "{reminder.title}" marked done; next due {reminder.next_due_at}.',
        machine_id,
    )
    db.commit()
    db.refresh(reminder)
    return reminder


@router.delete("/machines/{machine_id}/reminders/{reminder_id}", status_code=204)
def delete_reminder(machine_id: int, reminder_id: int, db: Session = Depends(get_db)):
    reminder = _get_reminder(db, machine_id, reminder_id)
    if not reminder.is_custom:
        raise HTTPException(
            status_code=400,
            detail="Only custom reminders can be deleted. Disable template reminders instead.",
        )
    log_event(db, "reminder_deleted", f'Custom reminder "{reminder.title}" deleted.', machine_id)
    db.delete(reminder)
    db.commit()
    return Response(status_code=204)


@router.get(
    "/machines/{machine_id}/reminders/apply-templates/preview",
    response_model=ApplyRemindersPreview,
)
def preview_apply_reminders(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    return ApplyRemindersPreview(reminders=missing_reminder_templates(db, machine))


@router.post(
    "/machines/{machine_id}/reminders/apply-templates", response_model=ApplyRemindersResult
)
def apply_reminders(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    added = apply_missing_reminders(db, machine)
    if added:
        log_event(
            db, "reminders_applied", f"{len(added)} new default reminder(s) applied.", machine_id
        )
    db.commit()
    for r in added:
        db.refresh(r)
    return ApplyRemindersResult(added=added)
