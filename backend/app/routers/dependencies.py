from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Dependency, Machine
from app.routers.helpers import get_machine_or_404
from app.schemas.machine import DependencyCreate, DependencyOut, ReverseDependencyOut
from app.services.activity import log_event

router = APIRouter(prefix="/machines/{machine_id}/dependencies", tags=["dependencies"])


def _out(dep: Dependency) -> DependencyOut:
    out = DependencyOut.model_validate(dep)
    out.depends_on_machine_name = dep.depends_on_machine.name if dep.depends_on_machine else None
    return out


def _validate_target(db: Session, machine_id: int, payload: DependencyCreate) -> None:
    if payload.depends_on_machine_id is not None:
        if payload.depends_on_machine_id == machine_id:
            raise HTTPException(status_code=400, detail="A machine cannot depend on itself")
        if db.get(Machine, payload.depends_on_machine_id) is None:
            raise HTTPException(status_code=400, detail="Dependency target machine not found")
    elif not (payload.external_name or "").strip():
        raise HTTPException(
            status_code=400, detail="Select a machine or provide an external dependency name"
        )


@router.get("", response_model=list[DependencyOut])
def list_dependencies(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    return [_out(d) for d in machine.dependencies]


@router.get("/reverse", response_model=list[ReverseDependencyOut])
def reverse_dependencies(machine_id: int, db: Session = Depends(get_db)):
    get_machine_or_404(db, machine_id)
    deps = db.scalars(
        select(Dependency).where(Dependency.depends_on_machine_id == machine_id)
    )
    return [
        ReverseDependencyOut(
            machine_id=d.machine.id,
            machine_name=d.machine.name,
            machine_type=d.machine.machine_type,
            machine_status=d.machine.status,
            dependency_type=d.dependency_type,
            notes=d.notes,
        )
        for d in deps
    ]


@router.post("", response_model=DependencyOut, status_code=201)
def create_dependency(machine_id: int, payload: DependencyCreate, db: Session = Depends(get_db)):
    get_machine_or_404(db, machine_id)
    _validate_target(db, machine_id, payload)
    existing = db.scalar(
        select(Dependency).where(
            Dependency.machine_id == machine_id,
            Dependency.depends_on_machine_id == payload.depends_on_machine_id,
            Dependency.depends_on_machine_id.isnot(None),
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="This dependency already exists")
    dep = Dependency(machine_id=machine_id, **payload.model_dump())
    db.add(dep)
    db.flush()
    name = dep.depends_on_machine.name if dep.depends_on_machine else dep.external_name
    log_event(db, "dependency_added", f'Dependency on "{name}" added.', machine_id)
    db.commit()
    db.refresh(dep)
    return _out(dep)


@router.put("/{dependency_id}", response_model=DependencyOut)
def update_dependency(
    machine_id: int, dependency_id: int, payload: DependencyCreate, db: Session = Depends(get_db)
):
    dep = db.get(Dependency, dependency_id)
    if dep is None or dep.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Dependency not found")
    _validate_target(db, machine_id, payload)
    for key, value in payload.model_dump().items():
        setattr(dep, key, value)
    db.commit()
    db.refresh(dep)
    return _out(dep)


@router.delete("/{dependency_id}", status_code=204)
def delete_dependency(machine_id: int, dependency_id: int, db: Session = Depends(get_db)):
    dep = db.get(Dependency, dependency_id)
    if dep is None or dep.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Dependency not found")
    name = dep.depends_on_machine.name if dep.depends_on_machine else dep.external_name
    log_event(db, "dependency_removed", f'Dependency on "{name}" removed.', machine_id)
    db.delete(dep)
    db.commit()
    return Response(status_code=204)
