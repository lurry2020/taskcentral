"""Sample data seeded only when DEMO_MODE=true. Tagged 'sample-data' so it can be cleared."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Machine, Service
from app.routers.helpers import resolve_tags
from app.services.activity import log_event
from app.services.checklist import generate_checklist

logger = logging.getLogger(__name__)

SAMPLES = [
    {
        "name": "docker-host-01",
        "machine_type": "VM",
        "status": "In Progress",
        "host": "proxmox-01",
        "vmid": 104,
        "ip_address": "192.168.10.40",
        "dns_record": "docker-host-01.home.arpa",
        "operating_system": "Debian",
        "operating_system_version": "12",
        "cpu_cores": 4,
        "memory_value": 8,
        "memory_unit": "GB",
        "disk_value": 64,
        "disk_unit": "GB",
        "purpose": "Primary Docker host",
        "services": [("Uptime Kuma", 3001), ("Homarr", 7575)],
    },
    {
        "name": "pihole-01",
        "machine_type": "LXC",
        "status": "Active",
        "host": "proxmox-01",
        "vmid": 110,
        "ip_address": "192.168.10.5",
        "dns_record": "pihole-01.home.arpa",
        "operating_system": "Debian",
        "operating_system_version": "12",
        "cpu_cores": 1,
        "memory_value": 512,
        "memory_unit": "MB",
        "disk_value": 8,
        "disk_unit": "GB",
        "purpose": "DNS and ad blocking",
        "services": [("Pi-hole", 80)],
    },
    {
        "name": "nas-01",
        "machine_type": "PHYSICAL",
        "status": "Active",
        "host": "rack-shelf-2",
        "ip_address": "192.168.10.10",
        "dns_record": "nas-01.home.arpa",
        "operating_system": "TrueNAS SCALE",
        "hardware_model": "Custom build",
        "purpose": "Bulk storage and backups",
        "services": [("SMB", 445), ("NFS", 2049)],
    },
]


def seed_demo_machines(db: Session) -> int:
    if db.scalar(select(Machine.id).limit(1)) is not None:
        return 0
    created = 0
    for sample in SAMPLES:
        services = sample.pop("services", [])
        machine = Machine(**sample)
        machine.tags = resolve_tags(db, ["sample-data"])
        db.add(machine)
        db.flush()
        for i, (name, port) in enumerate(services):
            db.add(Service(machine_id=machine.id, name=name, port=port, sort_order=(i + 1) * 10))
        generate_checklist(db, machine)
        log_event(db, "machine_created", f'Sample machine "{machine.name}" created (demo mode).', machine.id)
        created += 1
    db.commit()
    logger.info("Demo mode: seeded %d sample machines", created)
    return created
