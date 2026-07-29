from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import NetworkDevice, NetworkSegment
from app.routers.helpers import get_machine_or_404
from app.schemas.machine import (
    NetworkDeviceCreate,
    NetworkDeviceOut,
    NetworkDeviceUpdate,
    NetworkSegmentCreate,
    NetworkSegmentOut,
    NetworkSegmentUpdate,
)
from app.schemas.task import TaskReorderRequest
from app.services.activity import log_event

router = APIRouter(prefix="/machines/{machine_id}", tags=["network"])


# --- Network devices (switches, access points, …) ---------------------------

def _get_device(db: Session, machine_id: int, device_id: int) -> NetworkDevice:
    device = db.get(NetworkDevice, device_id)
    if device is None or device.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Network device not found")
    return device


@router.get("/network-devices", response_model=list[NetworkDeviceOut])
def list_devices(machine_id: int, db: Session = Depends(get_db)):
    get_machine_or_404(db, machine_id)
    return list(
        db.scalars(
            select(NetworkDevice)
            .where(NetworkDevice.machine_id == machine_id)
            .order_by(NetworkDevice.sort_order, NetworkDevice.id)
        )
    )


@router.post("/network-devices", response_model=NetworkDeviceOut, status_code=201)
def create_device(machine_id: int, payload: NetworkDeviceCreate, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    max_order = max((d.sort_order for d in machine.network_devices), default=0)
    device = NetworkDevice(
        machine_id=machine_id, **{**payload.model_dump(exclude={"sort_order"}), "sort_order": max_order + 10}
    )
    db.add(device)
    log_event(db, "network_device_added", f'Network device "{device.name}" added.', machine_id)
    db.commit()
    db.refresh(device)
    return device


@router.put("/network-devices/{device_id}", response_model=NetworkDeviceOut)
def update_device(
    machine_id: int, device_id: int, payload: NetworkDeviceUpdate, db: Session = Depends(get_db)
):
    device = _get_device(db, machine_id, device_id)
    for key, value in payload.model_dump(exclude={"sort_order"}).items():
        setattr(device, key, value)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/network-devices/{device_id}", status_code=204)
def delete_device(machine_id: int, device_id: int, db: Session = Depends(get_db)):
    device = _get_device(db, machine_id, device_id)
    log_event(db, "network_device_removed", f'Network device "{device.name}" removed.', machine_id)
    db.delete(device)
    db.commit()
    return Response(status_code=204)


@router.post("/network-devices/reorder", response_model=list[NetworkDeviceOut])
def reorder_devices(machine_id: int, payload: TaskReorderRequest, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    by_id = {d.id: d for d in machine.network_devices}
    unknown = [i for i in payload.task_ids if i not in by_id]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown device ids: {unknown}")
    for position, device_id in enumerate(payload.task_ids):
        by_id[device_id].sort_order = (position + 1) * 10
    db.commit()
    return sorted(machine.network_devices, key=lambda d: (d.sort_order, d.id))


# --- Network segments (VLANs) ------------------------------------------------

def _get_segment(db: Session, machine_id: int, segment_id: int) -> NetworkSegment:
    segment = db.get(NetworkSegment, segment_id)
    if segment is None or segment.machine_id != machine_id:
        raise HTTPException(status_code=404, detail="Network segment not found")
    return segment


@router.get("/network-segments", response_model=list[NetworkSegmentOut])
def list_segments(machine_id: int, db: Session = Depends(get_db)):
    get_machine_or_404(db, machine_id)
    return list(
        db.scalars(
            select(NetworkSegment)
            .where(NetworkSegment.machine_id == machine_id)
            .order_by(NetworkSegment.sort_order, NetworkSegment.id)
        )
    )


@router.post("/network-segments", response_model=NetworkSegmentOut, status_code=201)
def create_segment(machine_id: int, payload: NetworkSegmentCreate, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    max_order = max((s.sort_order for s in machine.network_segments), default=0)
    segment = NetworkSegment(
        machine_id=machine_id, **{**payload.model_dump(exclude={"sort_order"}), "sort_order": max_order + 10}
    )
    db.add(segment)
    log_event(db, "network_segment_added", f'Network segment "{segment.name}" added.', machine_id)
    db.commit()
    db.refresh(segment)
    return segment


@router.put("/network-segments/{segment_id}", response_model=NetworkSegmentOut)
def update_segment(
    machine_id: int, segment_id: int, payload: NetworkSegmentUpdate, db: Session = Depends(get_db)
):
    segment = _get_segment(db, machine_id, segment_id)
    for key, value in payload.model_dump(exclude={"sort_order"}).items():
        setattr(segment, key, value)
    db.commit()
    db.refresh(segment)
    return segment


@router.delete("/network-segments/{segment_id}", status_code=204)
def delete_segment(machine_id: int, segment_id: int, db: Session = Depends(get_db)):
    segment = _get_segment(db, machine_id, segment_id)
    log_event(db, "network_segment_removed", f'Network segment "{segment.name}" removed.', machine_id)
    db.delete(segment)
    db.commit()
    return Response(status_code=204)


@router.post("/network-segments/reorder", response_model=list[NetworkSegmentOut])
def reorder_segments(machine_id: int, payload: TaskReorderRequest, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    by_id = {s.id: s for s in machine.network_segments}
    unknown = [i for i in payload.task_ids if i not in by_id]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown segment ids: {unknown}")
    for position, segment_id in enumerate(payload.task_ids):
        by_id[segment_id].sort_order = (position + 1) * 10
    db.commit()
    return sorted(machine.network_segments, key=lambda s: (s.sort_order, s.id))
