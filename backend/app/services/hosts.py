"""Auto-linking between guest machines (VM/LXC) and their hypervisor host.

When a VM or LXC selects a Host machine (by name) in its ``host`` field, we keep a
dependency row (guest depends on host, type "Host") in sync so the host's page and
Obsidian document list every machine it runs - without any manual step.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Dependency, Machine

HOST_DEPENDENCY_TYPE = "Host"


def find_host_machine(db: Session, host_name: str | None) -> Machine | None:
    if not host_name or not host_name.strip():
        return None
    return db.scalar(
        select(Machine).where(
            func.lower(Machine.name) == host_name.strip().lower(),
            Machine.machine_type == "HOST",
            Machine.archived_at.is_(None),
        )
    )


def sync_host_dependency(db: Session, machine: Machine) -> None:
    """Ensure a VM/LXC has exactly the right auto host-dependency for its host field."""
    if machine.machine_type not in ("VM", "LXC"):
        return

    host_machine = find_host_machine(db, machine.host)

    # Drop auto-managed host links that no longer point at the selected host.
    for dep in list(machine.dependencies):
        if dep.dependency_type == HOST_DEPENDENCY_TYPE and (
            host_machine is None or dep.depends_on_machine_id != host_machine.id
        ):
            machine.dependencies.remove(dep)
            db.delete(dep)

    if host_machine is None:
        return
    # Respect any pre-existing dependency (manual or auto) that already targets the host.
    if any(d.depends_on_machine_id == host_machine.id for d in machine.dependencies):
        return
    db.add(
        Dependency(
            machine_id=machine.id,
            depends_on_machine_id=host_machine.id,
            dependency_type=HOST_DEPENDENCY_TYPE,
            notes="Runs on this host",
        )
    )


def link_existing_guests(db: Session, host_machine: Machine) -> int:
    """When a host is created, link any existing VMs/LXCs that already name it."""
    if host_machine.machine_type != "HOST":
        return 0
    guests = db.scalars(
        select(Machine).where(
            func.lower(Machine.host) == host_machine.name.strip().lower(),
            Machine.machine_type.in_(["VM", "LXC"]),
            Machine.archived_at.is_(None),
            Machine.id != host_machine.id,
        )
    )
    linked = 0
    for guest in guests:
        if any(d.depends_on_machine_id == host_machine.id for d in guest.dependencies):
            continue
        db.add(
            Dependency(
                machine_id=guest.id,
                depends_on_machine_id=host_machine.id,
                dependency_type=HOST_DEPENDENCY_TYPE,
                notes="Runs on this host",
            )
        )
        linked += 1
    return linked
