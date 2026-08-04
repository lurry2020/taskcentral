import json
import re
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from jinja2 import StrictUndefined, TemplateError, Undefined
from jinja2.sandbox import SandboxedEnvironment

from app.models import ApplicationSetting, Machine
from sqlalchemy.orm import Session

MACHINE_TYPE_LABELS = {
    "VM": "VM",
    "LXC": "LXC",
    "PHYSICAL": "Physical Machine",
    "HOST": "Host",
    "NETWORK": "Network",
}

# Fallback timezone if the configured one is missing/invalid.
DEFAULT_TIME_ZONE = "America/New_York"


def _resolve_tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or DEFAULT_TIME_ZONE)
    except Exception:
        return ZoneInfo(DEFAULT_TIME_ZONE)


class SilentUndefined(Undefined):
    """Render missing values as empty strings instead of failing."""

    def _fail_with_undefined_error(self, *args, **kwargs):  # pragma: no cover
        return ""

    def __str__(self) -> str:
        return ""


def _human_size(value: float | None, unit: str | None) -> str | None:
    if value is None:
        return None
    if value == int(value):
        value = int(value)
    return f"{value} {unit}" if unit else str(value)


def _fmt(value: object, tz: ZoneInfo) -> object:
    if isinstance(value, datetime):
        # Stored timestamps are UTC (tz-aware) or naive-UTC; show them in the app tz.
        aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return aware.astimezone(tz).strftime("%Y-%m-%d %H:%M %Z")
    if isinstance(value, date):
        return value.isoformat()
    return value


def build_context(machine: Machine, settings: dict | None = None) -> dict:
    settings = settings or {}
    tz = _resolve_tz(settings.get("timezone"))
    notes_md = "\n\n".join(
        (f"### {n.title}\n\n{n.content}" if n.title else n.content) for n in machine.notes
    )
    machine_ctx = {
        "name": machine.name,
        "machine_type": MACHINE_TYPE_LABELS.get(machine.machine_type, machine.machine_type),
        "host": machine.host,
        "vmid": machine.vmid,
        "ip_address": machine.ip_address,
        "mac_address": machine.mac_address,
        "dns_record": machine.dns_record,
        "operating_system": machine.operating_system,
        "operating_system_version": machine.operating_system_version,
        "hypervisor": machine.hypervisor,
        "architecture": machine.architecture,
        "status": machine.status,
        "purpose": machine.purpose,
        "responsibilities": machine.responsibilities,
        "isp": machine.isp,
        "connection_type": machine.connection_type,
        "download_speed": machine.download_speed,
        "upload_speed": machine.upload_speed,
        "wan_type": machine.wan_type,
        "tags": [t.name for t in machine.tags],
        "cpu": machine.cpu,
        "cpu_cores": machine.cpu_cores,
        "memory": _human_size(machine.memory_value, machine.memory_unit),
        "disk": _human_size(machine.disk_value, machine.disk_unit),
        "storage_location": machine.storage_location,
        "gpu": machine.gpu,
        "network_interface": machine.network_interface,
        "hardware_model": machine.hardware_model,
        "serial_number": machine.serial_number,
        "asset_tag": machine.asset_tag,
        "location": machine.location,
        "owner": machine.owner,
        "created_at": _fmt(machine.created_at, tz),
        "deployment_date": _fmt(machine.deployment_date, tz),
        "notes": notes_md or None,
    }
    services = [
        {
            "name": s.name,
            "description": s.description,
            "port": s.port,
            "protocol": s.protocol,
            "url": s.url,
            "is_external": s.is_external,
            "notes": s.notes,
        }
        for s in machine.services
    ]
    storage = [
        {
            "name": s.name,
            "capacity": s.capacity,
            "purpose": s.purpose,
            "notes": s.notes,
        }
        for s in sorted(machine.storage, key=lambda x: (x.sort_order, x.id))
    ]
    network_devices = [
        {
            "name": d.name,
            "role": d.role,
            "ip_address": d.ip_address,
            "notes": d.notes,
        }
        for d in sorted(machine.network_devices, key=lambda x: (x.sort_order, x.id))
    ]
    network_segments = [
        {
            "name": s.name,
            "vlan_id": s.vlan_id,
            "subnet": s.subnet,
            "purpose": s.purpose,
            "notes": s.notes,
        }
        for s in sorted(machine.network_segments, key=lambda x: (x.sort_order, x.id))
    ]
    dependencies = [
        {
            "name": d.depends_on_machine.name if d.depends_on_machine else d.external_name,
            "dependency_type": d.dependency_type,
            "notes": d.notes,
            "is_external": d.depends_on_machine is None,
        }
        for d in machine.dependencies
    ]
    reverse_dependencies = [
        {
            "name": d.machine.name,
            "dependency_type": d.dependency_type,
            "notes": d.notes,
            "machine_type": d.machine.machine_type,
            "status": d.machine.status,
        }
        for d in machine.dependents
    ]
    # Guests (VMs/LXCs) that run on this machine - meaningful when it is a host.
    hosted_machines = sorted(
        (
            {
                "name": d.machine.name,
                "machine_type": d.machine.machine_type,
                "ip_address": d.machine.ip_address,
                "status": d.machine.status,
            }
            for d in machine.dependents
            if d.machine and d.machine.machine_type in ("VM", "LXC")
        ),
        key=lambda g: g["name"].lower(),
    )
    tasks = sorted(machine.tasks, key=lambda t: (t.sort_order, t.id))
    checklist = [
        {
            "title": t.title,
            "description": t.description,
            "category": t.category,
            "status": t.status,
            "required": t.required,
            "notes": t.notes,
            "completed_at": _fmt(t.completed_at, tz),
        }
        for t in tasks
    ]
    if not settings.get("obsidian_include_not_applicable", False):
        checklist = [t for t in checklist if t["status"] != "Not Applicable"]
    if not settings.get("obsidian_include_completed", True):
        checklist = [t for t in checklist if t["status"] != "Completed"]
    if not settings.get("obsidian_include_checklist", True):
        checklist = []
    return {
        "machine": machine_ctx,
        "services": services,
        "storage": storage,
        "network_devices": network_devices,
        "network_segments": network_segments,
        "dependencies": dependencies,
        "reverse_dependencies": reverse_dependencies,
        "hosted_machines": hosted_machines,
        "checklist": checklist,
        "completed_tasks": [t for t in checklist if t["status"] == "Completed"],
        "pending_tasks": [t for t in checklist if t["status"] not in ("Completed", "Not Applicable")],
        "now": datetime.now(tz).strftime("%Y-%m-%d %H:%M %Z"),
    }


SAMPLE_CONTEXT = {
    "machine": {
        "name": "docker-host-01",
        "machine_type": "VM",
        "host": "proxmox-01",
        "vmid": 104,
        "ip_address": "192.168.10.40",
        "mac_address": "BC:24:11:5A:0E:21",
        "dns_record": "docker-host-01.home.arpa",
        "operating_system": "Debian",
        "operating_system_version": "12",
        "hypervisor": "Proxmox VE 9",
        "architecture": "x86_64",
        "status": "Active",
        "purpose": "Primary Docker host for self-hosted services",
        "responsibilities": "Routing\nDHCP\nDNS Forwarding\nFirewall",
        "isp": "Brightspeed",
        "connection_type": "Fiber (FTTH)",
        "download_speed": "1 Gbps",
        "upload_speed": "1 Gbps",
        "wan_type": "Dynamic Public IP",
        "tags": ["docker", "core"],
        "cpu": "host",
        "cpu_cores": 4,
        "memory": "8 GB",
        "disk": "64 GB",
        "storage_location": "local-zfs",
        "gpu": None,
        "network_interface": "vmbr0",
        "hardware_model": None,
        "serial_number": None,
        "asset_tag": None,
        "location": "Homelab rack",
        "owner": "Me",
        "created_at": "2026-01-15 10:00",
        "deployment_date": "2026-01-16",
        "notes": "Runs the main docker compose stacks.",
    },
    "services": [
        {"name": "Uptime Kuma", "description": "Monitoring", "port": 3001, "protocol": "HTTP", "url": "http://192.168.10.40:3001", "is_external": False, "notes": None},
        {"name": "Homarr", "description": "Dashboard", "port": 7575, "protocol": "HTTP", "url": None, "is_external": False, "notes": None},
    ],
    "storage": [
        {"name": "nvme0n1", "capacity": "1 TB", "purpose": "Boot / VM disks", "notes": None},
        {"name": "sda", "capacity": "4 TB", "purpose": "Backups", "notes": None},
    ],
    "network_devices": [
        {"name": "UniFi Dream Router 7", "role": "Router", "ip_address": "192.168.1.1", "notes": None},
        {"name": "USW Flex Mini", "role": "Switch", "ip_address": "192.168.1.115", "notes": None},
        {"name": "U7 In-Wall", "role": "Access Point", "ip_address": "192.168.1.7", "notes": None},
    ],
    "network_segments": [
        {"name": "Main", "vlan_id": 1, "subnet": "192.168.1.0/24", "purpose": "Trusted devices & homelab", "notes": None},
        {"name": "IoT", "vlan_id": 2, "subnet": "192.168.2.0/24", "purpose": "Smart home devices", "notes": None},
    ],
    "dependencies": [
        {"name": "pihole-01", "dependency_type": "DNS", "notes": None, "is_external": False},
        {"name": "TrueNAS", "dependency_type": "Storage", "notes": "NFS mounts", "is_external": True},
    ],
    "reverse_dependencies": [
        {"name": "jellyfin-01", "dependency_type": "Application", "notes": None, "machine_type": "LXC", "status": "Active"},
    ],
    "hosted_machines": [
        {"name": "docker-host-01", "machine_type": "VM", "ip_address": "192.168.10.40", "status": "Active"},
        {"name": "pihole-01", "machine_type": "LXC", "ip_address": "192.168.10.5", "status": "Active"},
    ],
    "checklist": [
        {"title": "Create or configure the machine", "description": None, "category": "Provisioning", "status": "Completed", "required": True, "notes": None, "completed_at": "2026-01-15 11:00"},
        {"title": "Add DNS record to Pi-hole", "description": None, "category": "DNS", "status": "Pending", "required": True, "notes": None, "completed_at": None},
    ],
}
SAMPLE_CONTEXT["completed_tasks"] = [t for t in SAMPLE_CONTEXT["checklist"] if t["status"] == "Completed"]
SAMPLE_CONTEXT["pending_tasks"] = [t for t in SAMPLE_CONTEXT["checklist"] if t["status"] not in ("Completed", "Not Applicable")]


def render_template(content: str, context: dict, strict: bool = False) -> str:
    env = SandboxedEnvironment(
        undefined=StrictUndefined if strict else SilentUndefined,
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    template = env.from_string(content)
    return template.render(**context)


def validate_template(content: str) -> str | None:
    """Return an error message if the template fails to parse/render, else None."""
    try:
        render_template(content, SAMPLE_CONTEXT)
        return None
    except TemplateError as exc:
        return str(exc)


def safe_filename(name: str, fmt: str = "{name}.md") -> str:
    base = re.sub(r"[^A-Za-z0-9._ -]+", "-", name).strip(" .")
    base = (re.sub(r"-{2,}", "-", base) or "machine")[:150]
    try:
        filename = fmt.format(name=base, date=date.today().isoformat())
    except (KeyError, IndexError, ValueError):
        filename = f"{base}.md"
    # Strip any path components a hostile format string could smuggle in.
    filename = filename.replace("/", "-").replace("\\", "-").replace("..", "-").strip(" .")
    if not filename.endswith(".md"):
        filename = filename[:196] + ".md"
    return filename[:200]


def load_settings(db: Session) -> dict:
    return {
        row.key: json.loads(row.value)
        for row in db.query(ApplicationSetting).all()
    }
