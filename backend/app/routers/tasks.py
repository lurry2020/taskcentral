from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MachineTask
from app.routers.helpers import get_machine_or_404
from app.schemas.machine import ChecklistProgress
from app.schemas.task import (
    ApplyTemplatesPreview,
    ApplyTemplatesResult,
    MachineTaskCreate,
    MachineTaskOut,
    MachineTaskUpdate,
    TaskReorderRequest,
)
from app.services.activity import log_event
from app.services.checklist import (
    apply_missing_templates,
    checklist_progress,
    missing_template_tasks,
)

router = APIRouter(tags=["tasks"])


def _get_task(db: Session, machine_id: int, task_id: int) -> MachineTask:
    task = db.get(MachineTask, task_id)
    if task is None or task.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/machines/{machine_id}/tasks", response_model=list[MachineTaskOut])
def list_tasks(
    machine_id: int,
    db: Session = Depends(get_db),
    status: str | None = None,
    category: str | None = None,
):
    get_machine_or_404(db, machine_id)
    stmt = (
        select(MachineTask)
        .where(MachineTask.machine_id == machine_id)
        .order_by(MachineTask.sort_order, MachineTask.id)
    )
    if status:
        stmt = stmt.where(MachineTask.status == status)
    if category:
        stmt = stmt.where(MachineTask.category == category)
    return list(db.scalars(stmt))


@router.get("/machines/{machine_id}/tasks/progress", response_model=ChecklistProgress)
def task_progress(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    return ChecklistProgress(**checklist_progress(machine.tasks))


@router.post("/machines/{machine_id}/tasks", response_model=MachineTaskOut, status_code=201)
def create_task(machine_id: int, payload: MachineTaskCreate, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    max_order = max((t.sort_order for t in machine.tasks), default=0)
    task = MachineTask(
        machine_id=machine_id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        required=payload.required,
        due_date=payload.due_date,
        notes=payload.notes,
        status="Pending",
        is_custom=True,
        sort_order=max_order + 10,
    )
    db.add(task)
    log_event(db, "task_added", f'Custom task "{task.title}" added.', machine_id)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/machines/{machine_id}/tasks/{task_id}", response_model=MachineTaskOut)
def update_task(
    machine_id: int, task_id: int, payload: MachineTaskUpdate, db: Session = Depends(get_db)
):
    task = _get_task(db, machine_id, task_id)
    data = payload.model_dump(exclude_unset=True)
    old_status = task.status

    for key, value in data.items():
        setattr(task, key, value.value if hasattr(value, "value") else value)

    if "status" in data and task.status != old_status:
        if task.status == "Completed":
            task.completed_at = datetime.now(timezone.utc)
            log_event(db, "task_completed", f'Task "{task.title}" completed.', machine_id)
        else:
            if old_status == "Completed":
                task.completed_at = None
                log_event(
                    db,
                    "task_reopened",
                    f'Task "{task.title}" reopened ({task.status}).',
                    machine_id,
                )
            else:
                log_event(
                    db,
                    "task_status_changed",
                    f'Task "{task.title}" moved to {task.status}.',
                    machine_id,
                )
        if task.status != "Blocked":
            task.blocked_reason = None
        if task.status != "Not Applicable":
            task.not_applicable_reason = None
    elif data:
        log_event(db, "task_updated", f'Task "{task.title}" updated.', machine_id)

    db.commit()
    db.refresh(task)
    return task


@router.delete("/machines/{machine_id}/tasks/{task_id}", status_code=204)
def delete_task(machine_id: int, task_id: int, db: Session = Depends(get_db)):
    task = _get_task(db, machine_id, task_id)
    log_event(
        db,
        "task_deleted",
        f'Task "{task.title}" deleted from this machine checklist.',
        machine_id,
    )
    db.delete(task)
    db.commit()
    return Response(status_code=204)


@router.post("/machines/{machine_id}/tasks/reorder", response_model=list[MachineTaskOut])
def reorder_tasks(machine_id: int, payload: TaskReorderRequest, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    by_id = {t.id: t for t in machine.tasks}
    unknown = [i for i in payload.task_ids if i not in by_id]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown task ids: {unknown}")
    for position, task_id in enumerate(payload.task_ids):
        by_id[task_id].sort_order = (position + 1) * 10
    db.commit()
    return sorted(machine.tasks, key=lambda t: (t.sort_order, t.id))


@router.get(
    "/machines/{machine_id}/tasks/apply-templates/preview", response_model=ApplyTemplatesPreview
)
def preview_apply_templates(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    return ApplyTemplatesPreview(tasks=missing_template_tasks(db, machine))


@router.post("/machines/{machine_id}/tasks/apply-templates", response_model=ApplyTemplatesResult)
def apply_templates(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    added = apply_missing_templates(db, machine)
    if added:
        log_event(
            db,
            "tasks_applied",
            f"{len(added)} new default task(s) applied from templates.",
            machine_id,
        )
    db.commit()
    for t in added:
        db.refresh(t)
    return ApplyTemplatesResult(added=added)
