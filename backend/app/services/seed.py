import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ApplicationSetting, ObsidianTemplate, ReminderTemplate, TaskTemplate
from app.services.defaults import (
    DEFAULT_OBSIDIAN_TEMPLATES,
    DEFAULT_REMINDER_TEMPLATES,
    DEFAULT_SETTINGS,
    DEFAULT_TASK_TEMPLATES,
)
from app.services.setup import initialize_setup_state

logger = logging.getLogger(__name__)


def seed_task_templates(db: Session) -> int:
    if db.scalar(select(TaskTemplate.id).limit(1)) is not None:
        return 0
    created = 0
    for i, (title, description, category, scope, required) in enumerate(DEFAULT_TASK_TEMPLATES):
        db.add(
            TaskTemplate(
                title=title,
                description=description,
                category=category,
                machine_type_scope=scope,
                required=required,
                enabled=True,
                sort_order=(i + 1) * 10,
            )
        )
        created += 1
    return created


def seed_scope_task_templates(db: Session, scope: str) -> int:
    """Idempotently add the default templates for one machine-type scope.

    Used to backfill a newly-introduced scope (e.g. NETWORK) into a database that
    was already seeded, without touching or duplicating existing templates.
    """
    if db.scalar(select(TaskTemplate.id).where(TaskTemplate.machine_type_scope == scope).limit(1)):
        return 0
    max_order = db.scalar(select(TaskTemplate.sort_order).order_by(TaskTemplate.sort_order.desc())) or 0
    created = 0
    for title, description, category, tscope, required in DEFAULT_TASK_TEMPLATES:
        if tscope != scope:
            continue
        max_order += 10
        db.add(
            TaskTemplate(
                title=title,
                description=description,
                category=category,
                machine_type_scope=tscope,
                required=required,
                enabled=True,
                sort_order=max_order,
            )
        )
        created += 1
    return created


def seed_reminder_templates(db: Session) -> int:
    if db.scalar(select(ReminderTemplate.id).limit(1)) is not None:
        return 0
    created = 0
    for i, (title, description, category, scope, interval) in enumerate(DEFAULT_REMINDER_TEMPLATES):
        db.add(
            ReminderTemplate(
                title=title,
                description=description,
                category=category,
                machine_type_scope=scope,
                interval_days=interval,
                enabled=True,
                sort_order=(i + 1) * 10,
            )
        )
        created += 1
    return created


def seed_obsidian_templates(db: Session, replace: bool = False) -> int:
    created = 0
    for machine_type, (name, description, content) in DEFAULT_OBSIDIAN_TEMPLATES.items():
        existing = db.scalar(
            select(ObsidianTemplate).where(ObsidianTemplate.machine_type == machine_type)
        )
        if existing is not None:
            if replace:
                existing.name = name
                existing.description = description
                existing.content = content
                created += 1
            continue
        db.add(
            ObsidianTemplate(
                name=name, machine_type=machine_type, description=description, content=content
            )
        )
        created += 1
    return created


def seed_settings(db: Session) -> int:
    created = 0
    for key, value in DEFAULT_SETTINGS.items():
        if db.get(ApplicationSetting, key) is None:
            db.add(ApplicationSetting(key=key, value=json.dumps(value)))
            created += 1
    return created


def seed_all(db: Session) -> None:
    # This must run before seed_settings: an empty settings table identifies a
    # genuinely new installation, while any existing setting identifies a
    # legacy installation that must never be sent through first-run setup.
    initialize_setup_state(db)
    templates = seed_task_templates(db)
    # Backfill scopes introduced after the initial seed on existing databases.
    templates += seed_scope_task_templates(db, "NETWORK")
    reminders = seed_reminder_templates(db)
    obsidian = seed_obsidian_templates(db)
    settings = seed_settings(db)
    db.commit()
    if templates or reminders or obsidian or settings:
        logger.info(
            "Seeded defaults: %d task templates, %d reminder templates, %d obsidian templates, %d settings",
            templates,
            reminders,
            obsidian,
            settings,
        )
