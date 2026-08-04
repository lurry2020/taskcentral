from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Machine, MachineTask, TaskTemplate


def applicable_templates(db: Session, machine_type: str) -> list[TaskTemplate]:
    # Network gear uses its own focused checklist rather than the server-centric
    # "ALL" tasks; every other type gets ALL plus its type-specific tasks.
    scopes = ["NETWORK"] if machine_type == "NETWORK" else ["ALL", machine_type]
    return list(
        db.scalars(
            select(TaskTemplate)
            .where(TaskTemplate.enabled.is_(True))
            .where(TaskTemplate.machine_type_scope.in_(scopes))
            .order_by(TaskTemplate.sort_order, TaskTemplate.id)
        )
    )


def generate_checklist(db: Session, machine: Machine) -> list[MachineTask]:
    """Copy applicable enabled task templates into independent machine task records."""
    tasks = []
    for template in applicable_templates(db, machine.machine_type):
        task = MachineTask(
            machine_id=machine.id,
            template_id=template.id,
            title=template.title,
            description=template.description,
            category=template.category,
            required=template.required,
            sort_order=template.sort_order,
            status="Pending",
            is_custom=False,
        )
        db.add(task)
        tasks.append(task)
    return tasks


def missing_template_tasks(db: Session, machine: Machine) -> list[TaskTemplate]:
    """Templates that would be added by 'Apply new default tasks' - skips duplicates.

    A template is a duplicate if the machine already has a task linked to it or a
    task with the same title (covers tasks whose template link was severed).
    """
    existing_template_ids = {
        t.template_id for t in machine.tasks if t.template_id is not None
    }
    existing_titles = {t.title.strip().lower() for t in machine.tasks}
    return [
        template
        for template in applicable_templates(db, machine.machine_type)
        if template.id not in existing_template_ids
        and template.title.strip().lower() not in existing_titles
    ]


def apply_missing_templates(db: Session, machine: Machine) -> list[MachineTask]:
    added = []
    for template in missing_template_tasks(db, machine):
        task = MachineTask(
            machine_id=machine.id,
            template_id=template.id,
            title=template.title,
            description=template.description,
            category=template.category,
            required=template.required,
            sort_order=template.sort_order,
            status="Pending",
            is_custom=False,
        )
        db.add(task)
        added.append(task)
    return added


def checklist_progress(tasks: list[MachineTask]) -> dict:
    applicable = [t for t in tasks if t.status != "Not Applicable"]
    completed = [t for t in applicable if t.status == "Completed"]
    return {
        "total_tasks": len(tasks),
        "applicable_tasks": len(applicable),
        "completed_tasks": len(completed),
        "pending_tasks": len([t for t in applicable if t.status in ("Pending", "In Progress")]),
        "blocked_tasks": len([t for t in applicable if t.status == "Blocked"]),
        "progress_percent": round(100 * len(completed) / len(applicable)) if applicable else 0,
    }
