from fastapi import APIRouter, Depends, HTTPException
from jinja2 import TemplateError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ObsidianTemplate
from app.schemas.template import (
    ObsidianTemplateOut,
    ObsidianTemplateUpdate,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
    TemplateVariable,
)
from app.services.defaults import DEFAULT_OBSIDIAN_TEMPLATES, TEMPLATE_VARIABLES
from app.services.rendering import SAMPLE_CONTEXT, render_template, validate_template

router = APIRouter(prefix="/obsidian-templates", tags=["obsidian-templates"])


def _get_template(db: Session, template_id: int) -> ObsidianTemplate:
    template = db.get(ObsidianTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Obsidian template not found")
    return template


@router.get("", response_model=list[ObsidianTemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return list(db.scalars(select(ObsidianTemplate).order_by(ObsidianTemplate.machine_type)))


@router.get("/variables", response_model=list[TemplateVariable])
def list_variables():
    return TEMPLATE_VARIABLES


@router.post("/preview", response_model=TemplatePreviewResponse)
def preview_template(payload: TemplatePreviewRequest):
    try:
        return TemplatePreviewResponse(rendered=render_template(payload.content, SAMPLE_CONTEXT))
    except TemplateError as exc:
        return TemplatePreviewResponse(error=str(exc))


@router.get("/{template_id}", response_model=ObsidianTemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db)):
    return _get_template(db, template_id)


@router.put("/{template_id}", response_model=ObsidianTemplateOut)
def update_template(
    template_id: int, payload: ObsidianTemplateUpdate, db: Session = Depends(get_db)
):
    template = _get_template(db, template_id)
    error = validate_template(payload.content)
    if error:
        raise HTTPException(status_code=422, detail=f"Template error: {error}")
    template.name = payload.name
    template.description = payload.description
    template.content = payload.content
    db.commit()
    db.refresh(template)
    return template


@router.post("/{template_id}/reset", response_model=ObsidianTemplateOut)
def reset_template(template_id: int, db: Session = Depends(get_db)):
    template = _get_template(db, template_id)
    default = DEFAULT_OBSIDIAN_TEMPLATES.get(template.machine_type)
    if default is None:
        raise HTTPException(status_code=400, detail="No default exists for this machine type")
    template.name, template.description, template.content = default
    db.commit()
    db.refresh(template)
    return template
