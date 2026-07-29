from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Machine, MachineReminder, ReminderTemplate


def applicable_reminder_templates(db: Session, machine_type: str) -> list[ReminderTemplate]:
    # Network gear uses only NETWORK-scoped reminders; every other type gets ALL
    # plus its type-specific ones (mirrors the checklist scoping rule).
    scopes = ["NETWORK"] if machine_type == "NETWORK" else ["ALL", machine_type]
    return list(
        db.scalars(
            select(ReminderTemplate)
            .where(ReminderTemplate.enabled.is_(True))
            .where(ReminderTemplate.machine_type_scope.in_(scopes))
            .order_by(ReminderTemplate.sort_order, ReminderTemplate.id)
        )
    )


def compute_next_due(last_performed: date | None, interval_days: int, base: date | None = None) -> date:
    start = last_performed or base or date.today()
    return start + timedelta(days=max(1, interval_days))


def _reminder_from_template(machine_id: int, template: ReminderTemplate) -> MachineReminder:
    return MachineReminder(
        machine_id=machine_id,
        template_id=template.id,
        title=template.title,
        description=template.description,
        category=template.category,
        interval_days=template.interval_days,
        enabled=True,
        is_custom=False,
        sort_order=template.sort_order,
        last_performed_at=None,
        # New machine: first occurrence is due one interval from setup.
        next_due_at=compute_next_due(None, template.interval_days),
    )


def generate_reminders(db: Session, machine: Machine) -> list[MachineReminder]:
    reminders = []
    for template in applicable_reminder_templates(db, machine.machine_type):
        reminder = _reminder_from_template(machine.id, template)
        db.add(reminder)
        reminders.append(reminder)
    return reminders


def missing_reminder_templates(db: Session, machine: Machine) -> list[ReminderTemplate]:
    existing_template_ids = {r.template_id for r in machine.reminders if r.template_id is not None}
    existing_titles = {r.title.strip().lower() for r in machine.reminders}
    return [
        t
        for t in applicable_reminder_templates(db, machine.machine_type)
        if t.id not in existing_template_ids and t.title.strip().lower() not in existing_titles
    ]


def apply_missing_reminders(db: Session, machine: Machine) -> list[MachineReminder]:
    added = []
    for template in missing_reminder_templates(db, machine):
        reminder = _reminder_from_template(machine.id, template)
        db.add(reminder)
        added.append(reminder)
    return added


def due_reminders(db: Session, today: date | None = None) -> list[MachineReminder]:
    """Enabled, non-archived reminders whose next-due date is today or earlier."""
    today = today or date.today()
    return list(
        db.scalars(
            select(MachineReminder)
            .join(Machine, MachineReminder.machine_id == Machine.id)
            .where(Machine.archived_at.is_(None))
            .where(MachineReminder.enabled.is_(True))
            .where(MachineReminder.next_due_at.is_not(None))
            .where(MachineReminder.next_due_at <= today)
            .order_by(MachineReminder.next_due_at)
        )
    )
