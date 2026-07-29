from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ReminderTemplate
from app.schemas.reminder import (
    ReminderTemplateCreate,
    ReminderTemplateOut,
    ReminderTemplateUpdate,
)

router = APIRouter(tags=["reminder-templates"])


@router.get("/reminder-templates", response_model=list[ReminderTemplateOut])
def list_templates(db: Session = Depends(get_db), scope: str | None = None):
    stmt = select(ReminderTemplate).order_by(ReminderTemplate.sort_order, ReminderTemplate.id)
    if scope:
        stmt = stmt.where(ReminderTemplate.machine_type_scope.in_(["ALL", scope]))
    return list(db.scalars(stmt))


@router.post("/reminder-templates", response_model=ReminderTemplateOut, status_code=201)
def create_template(payload: ReminderTemplateCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["machine_type_scope"] = payload.machine_type_scope.value
    if data["sort_order"] == 0:
        max_order = db.scalar(
            select(ReminderTemplate.sort_order).order_by(ReminderTemplate.sort_order.desc()).limit(1)
        )
        data["sort_order"] = (max_order or 0) + 10
    template = ReminderTemplate(**data)
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/reminder-templates/{template_id}", response_model=ReminderTemplateOut)
def update_template(
    template_id: int, payload: ReminderTemplateUpdate, db: Session = Depends(get_db)
):
    template = db.get(ReminderTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Reminder template not found")
    data = payload.model_dump()
    data["machine_type_scope"] = payload.machine_type_scope.value
    for key, value in data.items():
        setattr(template, key, value)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/reminder-templates/{template_id}", status_code=204)
def delete_template(template_id: int, db: Session = Depends(get_db)):
    template = db.get(ReminderTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Reminder template not found")
    db.delete(template)
    db.commit()
    return Response(status_code=204)
