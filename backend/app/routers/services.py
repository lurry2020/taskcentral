from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Service
from app.routers.helpers import get_machine_or_404
from app.schemas.machine import ServiceCreate, ServiceOut, ServiceUpdate
from app.schemas.task import TaskReorderRequest
from app.services.activity import log_event
from app.services.documentation import mark_obsidian_document_outdated

router = APIRouter(prefix="/machines/{machine_id}/services", tags=["services"])


def _get_service(db: Session, machine_id: int, service_id: int) -> Service:
    service = db.get(Service, service_id)
    if service is None or service.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Service not found")
    return service


@router.get("", response_model=list[ServiceOut])
def list_services(machine_id: int, db: Session = Depends(get_db)):
    get_machine_or_404(db, machine_id)
    return list(
        db.scalars(
            select(Service)
            .where(Service.machine_id == machine_id)
            .order_by(Service.sort_order, Service.id)
        )
    )


@router.post("", response_model=ServiceOut, status_code=201)
def create_service(machine_id: int, payload: ServiceCreate, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    max_order = max((s.sort_order for s in machine.services), default=0)
    service = Service(machine_id=machine_id, **{**payload.model_dump(), "sort_order": max_order + 10})
    db.add(service)
    mark_obsidian_document_outdated(machine)
    log_event(db, "service_added", f'Service "{service.name}" added.', machine_id)
    db.commit()
    db.refresh(service)
    return service


@router.put("/{service_id}", response_model=ServiceOut)
def update_service(
    machine_id: int, service_id: int, payload: ServiceUpdate, db: Session = Depends(get_db)
):
    service = _get_service(db, machine_id, service_id)
    machine = get_machine_or_404(db, machine_id)
    for key, value in payload.model_dump(exclude={"sort_order"}).items():
        setattr(service, key, value)
    mark_obsidian_document_outdated(machine)
    log_event(db, "service_updated", f'Service "{service.name}" updated.', machine_id)
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=204)
def delete_service(machine_id: int, service_id: int, db: Session = Depends(get_db)):
    service = _get_service(db, machine_id, service_id)
    machine = get_machine_or_404(db, machine_id)
    log_event(db, "service_removed", f'Service "{service.name}" removed.', machine_id)
    db.delete(service)
    mark_obsidian_document_outdated(machine)
    db.commit()
    return Response(status_code=204)


@router.post("/reorder", response_model=list[ServiceOut])
def reorder_services(machine_id: int, payload: TaskReorderRequest, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    by_id = {s.id: s for s in machine.services}
    unknown = [i for i in payload.task_ids if i not in by_id]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown service ids: {unknown}")
    for position, service_id in enumerate(payload.task_ids):
        by_id[service_id].sort_order = (position + 1) * 10
    mark_obsidian_document_outdated(machine)
    db.commit()
    return sorted(machine.services, key=lambda s: (s.sort_order, s.id))
