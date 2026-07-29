from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TaskTemplate
from app.schemas.task import TaskTemplateCreate, TaskTemplateOut, TaskTemplateUpdate
from app.services.defaults import DEPENDENCY_TYPES, MACHINE_STATUSES, TASK_CATEGORIES

router = APIRouter(tags=["task-templates"])


@router.get("/meta/options")
def meta_options():
    return {
        "task_categories": TASK_CATEGORIES,
        "dependency_types": DEPENDENCY_TYPES,
        "machine_statuses": MACHINE_STATUSES,
        "task_statuses": ["Pending", "In Progress", "Completed", "Blocked", "Not Applicable"],
        "machine_types": [
            {"value": "VM", "label": "VM"},
            {"value": "LXC", "label": "LXC"},
            {"value": "PHYSICAL", "label": "Physical Machine"},
            {"value": "HOST", "label": "Host"},
            {"value": "NETWORK", "label": "Network"},
        ],
    }


@router.get("/task-templates", response_model=list[TaskTemplateOut])
def list_templates(db: Session = Depends(get_db), scope: str | None = None):
    stmt = select(TaskTemplate).order_by(TaskTemplate.sort_order, TaskTemplate.id)
    if scope:
        stmt = stmt.where(TaskTemplate.machine_type_scope.in_(["ALL", scope]))
    return list(db.scalars(stmt))


@router.post("/task-templates", response_model=TaskTemplateOut, status_code=201)
def create_template(payload: TaskTemplateCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["machine_type_scope"] = payload.machine_type_scope.value
    if data["sort_order"] == 0:
        max_order = db.scalar(
            select(TaskTemplate.sort_order).order_by(TaskTemplate.sort_order.desc()).limit(1)
        )
        data["sort_order"] = (max_order or 0) + 10
    template = TaskTemplate(**data)
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/task-templates/{template_id}", response_model=TaskTemplateOut)
def update_template(template_id: int, payload: TaskTemplateUpdate, db: Session = Depends(get_db)):
    template = db.get(TaskTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Task template not found")
    data = payload.model_dump()
    data["machine_type_scope"] = payload.machine_type_scope.value
    for key, value in data.items():
        setattr(template, key, value)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/task-templates/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    template = db.get(TaskTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Task template not found")
    db.delete(template)
    db.commit()
    return Response(status_code=204)
