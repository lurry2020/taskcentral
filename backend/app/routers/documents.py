from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from jinja2 import TemplateError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import GeneratedDocument, ObsidianTemplate
from app.routers.helpers import get_machine_or_404
from app.schemas.template import GeneratedDocumentListItem, GeneratedDocumentOut
from app.services.activity import log_event
from app.services.documentation import mark_obsidian_document_current
from app.services.rendering import build_context, load_settings, render_template, safe_filename

router = APIRouter(prefix="/machines/{machine_id}/documents", tags=["documents"])


@router.get("", response_model=list[GeneratedDocumentListItem])
def list_documents(
    machine_id: int, db: Session = Depends(get_db), limit: int = Query(default=50, ge=1, le=200)
):
    get_machine_or_404(db, machine_id)
    return list(
        db.scalars(
            select(GeneratedDocument)
            .where(GeneratedDocument.machine_id == machine_id)
            .order_by(GeneratedDocument.created_at.desc(), GeneratedDocument.id.desc())
            .limit(limit)
        )
    )


@router.post("/generate", response_model=GeneratedDocumentOut, status_code=201)
def generate_document(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    template = db.scalar(
        select(ObsidianTemplate).where(ObsidianTemplate.machine_type == machine.machine_type)
    )
    if template is None:
        raise HTTPException(
            status_code=400,
            detail=f"No Obsidian template configured for machine type {machine.machine_type}",
        )
    settings = load_settings(db)
    try:
        content = render_template(template.content, build_context(machine, settings))
    except TemplateError as exc:
        raise HTTPException(status_code=422, detail=f"Template error: {exc}") from exc
    filename = safe_filename(machine.name, settings.get("obsidian_filename_format", "{name}.md"))
    document = GeneratedDocument(
        machine_id=machine.id, template_id=template.id, filename=filename, content=content
    )
    db.add(document)
    mark_obsidian_document_current(machine)
    log_event(db, "document_generated", f"Obsidian document generated ({filename}).", machine.id)
    db.commit()
    db.refresh(document)
    return document


@router.get("/{document_id}", response_model=GeneratedDocumentOut)
def get_document(machine_id: int, document_id: int, db: Session = Depends(get_db)):
    document = db.get(GeneratedDocument, document_id)
    if document is None or document.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.get("/{document_id}/download", response_class=PlainTextResponse)
def download_document(machine_id: int, document_id: int, db: Session = Depends(get_db)):
    document = db.get(GeneratedDocument, document_id)
    if document is None or document.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return PlainTextResponse(
        document.content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{document.filename}"'},
    )
