from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    Dependency,
    Machine,
    NetworkDevice,
    NetworkSegment,
    Service,
    StorageDevice,
    Tag,
)
from app.routers.helpers import duplicate_warnings, get_machine_or_404, resolve_tags
from app.schemas.machine import (
    ChecklistProgress,
    DuplicateRequest,
    MachineCreate,
    MachineConnectivity,
    MachineConnectivityListItem,
    MachineListItem,
    MachineOut,
    MachineUpdate,
    ValidationWarnings,
)
from app.schemas.common import Page
from app.schemas.template import ActivityEventOut
from app.services.activity import log_event
from app.services.checklist import checklist_progress, generate_checklist
from app.services.connectivity import ping_ip_address
from app.services.documentation import mark_obsidian_document_outdated
from app.services.hosts import link_existing_guests, sync_host_dependency
from app.services.reminders import generate_reminders
from app.models import ActivityEvent

router = APIRouter(prefix="/machines", tags=["machines"])

SORTABLE = {
    "name": Machine.name,
    "created_at": Machine.created_at,
    "updated_at": Machine.updated_at,
}


def machine_out(machine: Machine, warnings: list[str] | None = None) -> MachineOut:
    out = MachineOut.model_validate(machine)
    out.progress = ChecklistProgress(**checklist_progress(machine.tasks))
    out.warnings = warnings or []
    return out


@router.get("", response_model=Page[MachineListItem])
def list_machines(
    db: Session = Depends(get_db),
    search: str | None = None,
    machine_type: str | None = Query(default=None, pattern="^(VM|LXC|PHYSICAL|HOST|NETWORK)$"),
    status: str | None = None,
    host: str | None = None,
    tag: str | None = None,
    archived: bool = False,
    sort_by: Literal["name", "created_at", "updated_at", "progress"] = "updated_at",
    sort_dir: Literal["asc", "desc"] = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
):
    stmt = select(Machine).options(selectinload(Machine.tasks))
    stmt = stmt.where(Machine.archived_at.isnot(None) if archived else Machine.archived_at.is_(None))
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Machine.name.ilike(like),
                Machine.ip_address.ilike(like),
                Machine.dns_record.ilike(like),
                Machine.host.ilike(like),
                Machine.purpose.ilike(like),
                Machine.operating_system.ilike(like),
            )
        )
    if machine_type:
        stmt = stmt.where(Machine.machine_type == machine_type)
    if status:
        stmt = stmt.where(Machine.status == status)
    if host:
        stmt = stmt.where(func.lower(Machine.host) == host.lower())
    if tag:
        stmt = stmt.where(Machine.tags.any(func.lower(Tag.name) == tag.lower()))

    machines = list(db.scalars(stmt))

    if sort_by == "progress":
        machines.sort(
            key=lambda m: checklist_progress(m.tasks)["progress_percent"],
            reverse=sort_dir == "desc",
        )
    else:
        machines.sort(
            key=lambda m: (getattr(m, sort_by) or "").lower()
            if sort_by == "name"
            else getattr(m, sort_by),
            reverse=sort_dir == "desc",
        )

    total = len(machines)
    start = (page - 1) * page_size
    window = machines[start : start + page_size]
    items = []
    for m in window:
        item = MachineListItem.model_validate(m)
        item.progress = ChecklistProgress(**checklist_progress(m.tasks))
        items.append(item)
    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/hosts", response_model=list[str])
def list_hosts(db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Machine.host).where(Machine.host.isnot(None), Machine.host != "").distinct()
    )
    return sorted(set(rows), key=str.lower)


@router.get("/tags", response_model=list[str])
def list_tags(db: Session = Depends(get_db)):
    return [t.name for t in db.scalars(select(Tag).order_by(Tag.name))]


def _connectivity_for_ip(ip_address: str | None) -> MachineConnectivity:
    checked_at = datetime.now(timezone.utc)
    if not ip_address:
        return MachineConnectivity(
            status="unknown",
            ip_address=None,
            checked_at=checked_at,
            message="No IP address is stored for this machine.",
        )
    result = ping_ip_address(ip_address)
    return MachineConnectivity(
        status=result.status,
        ip_address=ip_address,
        checked_at=checked_at,
        latency_ms=result.latency_ms,
        message=result.message,
    )


@router.get("/connectivity", response_model=list[MachineConnectivityListItem])
def list_machine_connectivity(
    machine_ids: list[int] = Query(...),
    db: Session = Depends(get_db),
):
    """Ping up to one inventory page of machines concurrently."""
    if len(machine_ids) > 200 or any(machine_id < 1 for machine_id in machine_ids):
        raise HTTPException(
            status_code=422,
            detail="Provide between 1 and 200 valid machine IDs.",
        )

    requested_ids = list(dict.fromkeys(machine_ids))
    stored_ips = dict(
        db.execute(
            select(Machine.id, Machine.ip_address).where(Machine.id.in_(requested_ids))
        ).all()
    )
    existing_ids = [machine_id for machine_id in requested_ids if machine_id in stored_ips]
    if not existing_ids:
        return []

    def check(machine_id: int) -> MachineConnectivityListItem:
        result = _connectivity_for_ip(stored_ips[machine_id])
        return MachineConnectivityListItem(
            machine_id=machine_id,
            **result.model_dump(),
        )

    with ThreadPoolExecutor(max_workers=min(10, len(existing_ids))) as executor:
        return list(executor.map(check, existing_ids))


@router.get("/validate", response_model=ValidationWarnings)
def validate_machine(
    db: Session = Depends(get_db),
    name: str | None = None,
    ip_address: str | None = None,
    dns_record: str | None = None,
    vmid: int | None = None,
    host: str | None = None,
    exclude_id: int | None = None,
):
    return ValidationWarnings(
        warnings=duplicate_warnings(
            db,
            name=name,
            ip_address=ip_address,
            dns_record=dns_record,
            vmid=vmid,
            host=host,
            exclude_id=exclude_id,
        )
    )


def _apply_fields(machine: Machine, payload: MachineUpdate | MachineCreate, db: Session) -> None:
    data = payload.model_dump(
        exclude={
            "tags",
            "services",
            "storage",
            "network_devices",
            "network_segments",
            "dependencies",
            "generate_checklist",
        },
        exclude_unset=False,
    )
    for key, value in data.items():
        setattr(machine, key, value.value if hasattr(value, "value") else value)
    machine.tags = resolve_tags(db, payload.tags)


@router.post("", response_model=MachineOut, status_code=201)
def create_machine(payload: MachineCreate, db: Session = Depends(get_db)):
    machine = Machine(name=payload.name, machine_type=payload.machine_type.value)
    _apply_fields(machine, payload, db)
    db.add(machine)
    db.flush()

    for i, svc in enumerate(payload.services):
        db.add(Service(machine_id=machine.id, **{**svc.model_dump(), "sort_order": i}))
    for i, dev in enumerate(payload.storage):
        db.add(StorageDevice(machine_id=machine.id, **{**dev.model_dump(exclude={"sort_order"}), "sort_order": (i + 1) * 10}))
    for i, nd in enumerate(payload.network_devices):
        db.add(NetworkDevice(machine_id=machine.id, **{**nd.model_dump(exclude={"sort_order"}), "sort_order": (i + 1) * 10}))
    for i, seg in enumerate(payload.network_segments):
        db.add(NetworkSegment(machine_id=machine.id, **{**seg.model_dump(exclude={"sort_order"}), "sort_order": (i + 1) * 10}))
    for dep in payload.dependencies:
        if dep.depends_on_machine_id == machine.id:
            raise HTTPException(status_code=400, detail="A machine cannot depend on itself")
        if dep.depends_on_machine_id is not None and db.get(Machine, dep.depends_on_machine_id) is None:
            raise HTTPException(status_code=400, detail="Dependency target machine not found")
        if dep.depends_on_machine_id is None and not (dep.external_name or "").strip():
            raise HTTPException(status_code=400, detail="Dependency needs a machine or external name")
        db.add(Dependency(machine_id=machine.id, **dep.model_dump()))

    if payload.generate_checklist:
        generate_checklist(db, machine)
        generate_reminders(db, machine)

    db.flush()
    if machine.machine_type == "HOST":
        link_existing_guests(db, machine)
    else:
        sync_host_dependency(db, machine)

    log_event(db, "machine_created", f'Machine "{machine.name}" created.', machine.id)
    warnings = duplicate_warnings(
        db,
        name=machine.name,
        ip_address=machine.ip_address,
        dns_record=machine.dns_record,
        vmid=machine.vmid,
        host=machine.host,
        exclude_id=machine.id,
    )
    db.commit()
    db.refresh(machine)
    return machine_out(machine, warnings)


@router.get("/{machine_id}", response_model=MachineOut)
def get_machine(machine_id: int, db: Session = Depends(get_db)):
    return machine_out(get_machine_or_404(db, machine_id))


@router.get("/{machine_id}/connectivity", response_model=MachineConnectivity)
def machine_connectivity(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    return _connectivity_for_ip(machine.ip_address)


@router.put("/{machine_id}", response_model=MachineOut)
def update_machine(machine_id: int, payload: MachineUpdate, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    changed: list[str] = []
    before = {
        k: getattr(machine, k)
        for k in payload.model_dump(exclude={"tags"})
    }
    before_tags = {tag.name.casefold() for tag in machine.tags}
    _apply_fields(machine, payload, db)
    for key, old in before.items():
        new = getattr(machine, key)
        if str(old) != str(new):
            changed.append(key)
    if before_tags != {tag.name.casefold() for tag in machine.tags}:
        changed.append("tags")
    if changed:
        mark_obsidian_document_outdated(machine)
        log_event(
            db,
            "machine_updated",
            f'Machine "{machine.name}" updated ({", ".join(sorted(changed))}).',
            machine.id,
        )
    # Keep the guest→host link current if the host field changed.
    sync_host_dependency(db, machine)
    warnings = duplicate_warnings(
        db,
        name=machine.name,
        ip_address=machine.ip_address,
        dns_record=machine.dns_record,
        vmid=machine.vmid,
        host=machine.host,
        exclude_id=machine.id,
    )
    db.commit()
    db.refresh(machine)
    return machine_out(machine, warnings)


@router.post("/{machine_id}/archive", response_model=MachineOut)
def archive_machine(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    if machine.archived_at is None:
        machine.archived_at = datetime.now(timezone.utc)
        machine.status = "Archived"
        log_event(db, "machine_archived", f'Machine "{machine.name}" archived.', machine.id)
        db.commit()
        db.refresh(machine)
    return machine_out(machine)


@router.post("/{machine_id}/unarchive", response_model=MachineOut)
def unarchive_machine(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    if machine.archived_at is not None:
        machine.archived_at = None
        if machine.status == "Archived":
            machine.status = "Maintenance"
        log_event(db, "machine_unarchived", f'Machine "{machine.name}" restored from archive.', machine.id)
        db.commit()
        db.refresh(machine)
    return machine_out(machine)


@router.delete("/{machine_id}", status_code=204)
def delete_machine(machine_id: int, db: Session = Depends(get_db)):
    machine = get_machine_or_404(db, machine_id)
    log_event(db, "machine_deleted", f'Machine "{machine.name}" permanently deleted.')
    db.delete(machine)
    db.commit()
    return Response(status_code=204)


@router.post("/{machine_id}/duplicate", response_model=MachineOut, status_code=201)
def duplicate_machine(machine_id: int, payload: DuplicateRequest, db: Session = Depends(get_db)):
    source = get_machine_or_404(db, machine_id)
    clone = Machine(
        name=payload.name,
        machine_type=source.machine_type,
        status="Draft",
        host=source.host,
        # Identity fields intentionally cleared to avoid accidental duplication.
        vmid=None,
        ip_address=None,
        mac_address=None,
        dns_record=None,
        operating_system=source.operating_system,
        operating_system_version=source.operating_system_version,
        hypervisor=source.hypervisor,
        architecture=source.architecture,
        purpose=source.purpose,
        responsibilities=source.responsibilities,
        isp=source.isp,
        connection_type=source.connection_type,
        download_speed=source.download_speed,
        upload_speed=source.upload_speed,
        wan_type=source.wan_type,
        location=source.location,
        owner=source.owner,
        cpu=source.cpu,
        cpu_cores=source.cpu_cores,
        memory_value=source.memory_value,
        memory_unit=source.memory_unit,
        disk_value=source.disk_value,
        disk_unit=source.disk_unit,
        storage_location=source.storage_location,
        gpu=source.gpu,
        network_interface=source.network_interface,
        hardware_model=source.hardware_model,
        serial_number=None,
        asset_tag=None,
    )
    clone.tags = list(source.tags)
    db.add(clone)
    db.flush()
    if payload.copy_services:
        for s in source.services:
            db.add(
                Service(
                    machine_id=clone.id,
                    name=s.name,
                    description=s.description,
                    port=s.port,
                    protocol=s.protocol,
                    url=s.url,
                    is_external=s.is_external,
                    notes=s.notes,
                    sort_order=s.sort_order,
                )
            )
        for s in source.storage:
            db.add(
                StorageDevice(
                    machine_id=clone.id,
                    name=s.name,
                    capacity=s.capacity,
                    purpose=s.purpose,
                    notes=s.notes,
                    sort_order=s.sort_order,
                )
            )
        for d in source.network_devices:
            db.add(
                NetworkDevice(
                    machine_id=clone.id,
                    name=d.name,
                    role=d.role,
                    ip_address=d.ip_address,
                    notes=d.notes,
                    sort_order=d.sort_order,
                )
            )
        for seg in source.network_segments:
            db.add(
                NetworkSegment(
                    machine_id=clone.id,
                    name=seg.name,
                    vlan_id=seg.vlan_id,
                    subnet=seg.subnet,
                    purpose=seg.purpose,
                    notes=seg.notes,
                    sort_order=seg.sort_order,
                )
            )
    if payload.copy_dependencies:
        for d in source.dependencies:
            db.add(
                Dependency(
                    machine_id=clone.id,
                    depends_on_machine_id=d.depends_on_machine_id,
                    external_name=d.external_name,
                    dependency_type=d.dependency_type,
                    notes=d.notes,
                )
            )
    generate_checklist(db, clone)
    generate_reminders(db, clone)
    log_event(
        db,
        "machine_created",
        f'Machine "{clone.name}" created as a duplicate of "{source.name}".',
        clone.id,
    )
    db.commit()
    db.refresh(clone)
    return machine_out(clone)


@router.get("/{machine_id}/activity", response_model=list[ActivityEventOut])
def machine_activity(
    machine_id: int,
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=500),
):
    get_machine_or_404(db, machine_id)
    events = db.scalars(
        select(ActivityEvent)
        .where(ActivityEvent.machine_id == machine_id)
        .order_by(ActivityEvent.created_at.desc(), ActivityEvent.id.desc())
        .limit(limit)
    )
    return list(events)
