"""Transactional reset of Task Central to its first-run state."""

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import (
    ActivityEvent,
    ApplicationSetting,
    Dependency,
    GeneratedDocument,
    Machine,
    MachineNote,
    MachineReminder,
    MachineTask,
    NetworkDevice,
    NetworkSegment,
    ObsidianTemplate,
    ReminderTemplate,
    Service,
    StorageDevice,
    Tag,
    TaskTemplate,
    machine_tags,
)
from app.services.seed import seed_all


def reset_application(db: Session) -> None:
    """Delete application data and credentials, then restore first-run defaults.

    Child records are removed before their parents so this works consistently
    with databases that enforce foreign keys. ``seed_all`` commits only after
    the reset has been fully reseeded; any error rolls the entire operation
    back and preserves the existing installation.
    """
    try:
        for model in (
            ActivityEvent,
            GeneratedDocument,
            MachineTask,
            MachineReminder,
            MachineNote,
            Dependency,
            Service,
            StorageDevice,
            NetworkDevice,
            NetworkSegment,
        ):
            db.execute(delete(model))

        db.execute(delete(machine_tags))

        for model in (
            Machine,
            Tag,
            TaskTemplate,
            ReminderTemplate,
            ObsidianTemplate,
            ApplicationSetting,
        ):
            db.execute(delete(model))

        # Make the empty settings table visible to initialize_setup_state so it
        # identifies this as a new installation and writes setup_completed=false.
        db.flush()
        seed_all(db)
    except Exception:
        db.rollback()
        raise
