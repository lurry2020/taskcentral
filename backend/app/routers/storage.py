from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import StorageDevice
from app.routers.helpers import get_machine_or_404
from app.schemas.machine import StorageCreate, StorageOut, StorageUpdate
from app.schemas.task import TaskReorderRequest
from app.services.activity import log_event

router = APIRouter(prefix="/machines/{machine_id}/storage", tags=["storage"])


def _get_device(db: Session, machine_id: int, device_id: int) -> StorageDevice:
    device = db.get(StorageDevice, device_id)
    if device is None or device.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Storage device not found")
    return device


@router.get("", response_model=list[StorageOut])
def list_storage(machine_id: int, db: Session = Depends(get_db)):
    get_machine_or_404(db, machine_id)
    return list(
        db.scalars(
            select(StorageDevice)
            .where(StorageDevice.machine_id == machine_id)
            .order_by(StorageDevice.sort_order, StorageDevice.id)
        )
    )


@router.post("", response_model=StorageOut, status_code=201)
def create_storage(machine_id: int, payload: StorageCreate, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    max_order = max((s.sort_order for s in machine.storage), default=0)
    device = StorageDevice(
        machine_id=machine_id, **{**payload.model_dump(), "sort_order": max_order + 10}
    )
    db.add(device)
    log_event(db, "storage_added", f'Storage "{device.name}" added.', machine_id)
    db.commit()
    db.refresh(device)
    return device


@router.put("/{device_id}", response_model=StorageOut)
def update_storage(
    machine_id: int, device_id: int, payload: StorageUpdate, db: Session = Depends(get_db)
):
    device = _get_device(db, machine_id, device_id)
    for key, value in payload.model_dump(exclude={"sort_order"}).items():
        setattr(device, key, value)
    log_event(db, "storage_updated", f'Storage "{device.name}" updated.', machine_id)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=204)
def delete_storage(machine_id: int, device_id: int, db: Session = Depends(get_db)):
    device = _get_device(db, machine_id, device_id)
    log_event(db, "storage_removed", f'Storage "{device.name}" removed.', machine_id)
    db.delete(device)
    db.commit()
    return Response(status_code=204)


@router.post("/reorder", response_model=list[StorageOut])
def reorder_storage(machine_id: int, payload: TaskReorderRequest, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    by_id = {s.id: s for s in machine.storage}
    unknown = [i for i in payload.task_ids if i not in by_id]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown storage ids: {unknown}")
    for position, device_id in enumerate(payload.task_ids):
        by_id[device_id].sort_order = (position + 1) * 10
    db.commit()
    return sorted(machine.storage, key=lambda s: (s.sort_order, s.id))
