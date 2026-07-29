from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Machine, Tag


def get_machine_or_404(db: Session, machine_id: int) -> Machine:
    machine = db.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine


def resolve_tags(db: Session, names: list[str]) -> list[Tag]:
    tags: list[Tag] = []
    for name in names:
        tag = db.scalar(select(Tag).where(func.lower(Tag.name) == name.lower()))
        if tag is None:
            tag = Tag(name=name)
            db.add(tag)
            db.flush()
        tags.append(tag)
    return tags


def duplicate_warnings(
    db: Session,
    *,
    name: str | None = None,
    ip_address: str | None = None,
    dns_record: str | None = None,
    vmid: int | None = None,
    host: str | None = None,
    exclude_id: int | None = None,
) -> list[str]:
    warnings: list[str] = []

    def others(condition) -> list[Machine]:
        stmt = select(Machine).where(condition, Machine.archived_at.is_(None))
        if exclude_id is not None:
            stmt = stmt.where(Machine.id != exclude_id)
        return list(db.scalars(stmt))

    if name:
        for m in others(func.lower(Machine.name) == name.lower()):
            warnings.append(f'A machine named "{m.name}" already exists (#{m.id}).')
    if ip_address:
        for m in others(Machine.ip_address == ip_address):
            warnings.append(f'IP address {ip_address} is already used by "{m.name}" (#{m.id}).')
    if dns_record:
        for m in others(func.lower(Machine.dns_record) == dns_record.lower()):
            warnings.append(f'DNS record {dns_record} is already used by "{m.name}" (#{m.id}).')
    if vmid is not None and host:
        for m in others((Machine.vmid == vmid) & (func.lower(Machine.host) == host.lower())):
            warnings.append(f'VMID {vmid} on host "{host}" is already used by "{m.name}" (#{m.id}).')
    return warnings
