from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MachineNote
from app.routers.helpers import get_machine_or_404
from app.schemas.machine import NoteCreate, NoteOut, NoteUpdate
from app.services.activity import log_event
from app.services.documentation import mark_obsidian_document_outdated

router = APIRouter(prefix="/machines/{machine_id}/notes", tags=["notes"])


def _get_note(db: Session, machine_id: int, note_id: int) -> MachineNote:
    note = db.get(MachineNote, note_id)
    if note is None or note.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.get("", response_model=list[NoteOut])
def list_notes(machine_id: int, db: Session = Depends(get_db)):
    get_machine_or_404(db, machine_id)
    return list(
        db.scalars(
            select(MachineNote)
            .where(MachineNote.machine_id == machine_id)
            .order_by(MachineNote.created_at.desc(), MachineNote.id.desc())
        )
    )


@router.post("", response_model=NoteOut, status_code=201)
def create_note(machine_id: int, payload: NoteCreate, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    note = MachineNote(machine_id=machine_id, title=payload.title, content=payload.content)
    db.add(note)
    mark_obsidian_document_outdated(machine)
    label = f' "{note.title}"' if note.title else ""
    log_event(db, "note_added", f"Note{label} added.", machine_id)
    db.commit()
    db.refresh(note)
    return note


@router.put("/{note_id}", response_model=NoteOut)
def update_note(machine_id: int, note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)):
    note = _get_note(db, machine_id, note_id)
    machine = get_machine_or_404(db, machine_id)
    note.title = payload.title
    note.content = payload.content
    mark_obsidian_document_outdated(machine)
    label = f' "{note.title}"' if note.title else ""
    log_event(db, "note_updated", f"Note{label} updated.", machine_id)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(machine_id: int, note_id: int, db: Session = Depends(get_db)):
    note = _get_note(db, machine_id, note_id)
    machine = get_machine_or_404(db, machine_id)
    label = f' "{note.title}"' if note.title else ""
    log_event(db, "note_deleted", f"Note{label} deleted.", machine_id)
    db.delete(note)
    mark_obsidian_document_outdated(machine)
    db.commit()
    return Response(status_code=204)
