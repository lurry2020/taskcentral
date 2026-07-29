import json
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import (
    ActivityEvent,
    ApplicationSetting,
    Dependency,
    GeneratedDocument,
    Machine,
    MachineNote,
    MachineReminder,
    MachineTask,
    NetworkDevice,
    NetworkSegment,
    ObsidianTemplate,
    ReminderTemplate,
    Service,
    StorageDevice,
    Tag,
    machine_tags,
)
from app.models.task import TaskTemplate
from app.routers.helpers import resolve_tags
from app.schemas.common import MachineType
from app.services.activity import log_event
from app.services.reset import reset_application

router = APIRouter(prefix="/data", tags=["data"])

EXPORT_VERSION = 1
VALID_MACHINE_TYPES = {machine_type.value for machine_type in MachineType}


def _row(obj: Any, fields: list[str]) -> dict:
    out = {}
    for f in fields:
        value = getattr(obj, f)
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        out[f] = value
    return out


MACHINE_FIELDS = [
    "id", "name", "machine_type", "status", "host", "vmid", "ip_address", "mac_address",
    "dns_record", "operating_system", "operating_system_version", "hypervisor", "architecture",
    "purpose", "responsibilities", "isp", "connection_type", "download_speed", "upload_speed",
    "wan_type", "location", "owner", "deployment_date", "cpu", "cpu_cores", "memory_value",
    "memory_unit", "disk_value", "disk_unit", "storage_location", "gpu", "network_interface",
    "hardware_model", "serial_number", "asset_tag", "archived_at", "created_at", "updated_at",
]
SERVICE_FIELDS = [
    "id", "machine_id", "name", "description", "port", "protocol", "url", "is_external",
    "notes", "sort_order", "created_at", "updated_at",
]
STORAGE_FIELDS = [
    "id", "machine_id", "name", "capacity", "purpose", "notes", "sort_order",
    "created_at", "updated_at",
]
NETWORK_DEVICE_FIELDS = [
    "id", "machine_id", "name", "role", "ip_address", "notes", "sort_order",
    "created_at", "updated_at",
]
NETWORK_SEGMENT_FIELDS = [
    "id", "machine_id", "name", "vlan_id", "subnet", "purpose", "notes", "sort_order",
    "created_at", "updated_at",
]
DEPENDENCY_FIELDS = [
    "id", "machine_id", "depends_on_machine_id", "external_name", "dependency_type", "notes",
    "created_at", "updated_at",
]
NOTE_FIELDS = ["id", "machine_id", "title", "content", "created_at", "updated_at"]
TASK_FIELDS = [
    "id", "machine_id", "template_id", "title", "description", "category", "status", "required",
    "is_custom", "sort_order", "due_date", "completed_at", "notes", "blocked_reason",
    "not_applicable_reason", "created_at", "updated_at",
]
TASK_TEMPLATE_FIELDS = [
    "id", "title", "description", "category", "machine_type_scope", "required", "enabled",
    "sort_order", "created_at", "updated_at",
]
REMINDER_TEMPLATE_FIELDS = [
    "id", "title", "description", "category", "machine_type_scope", "interval_days", "enabled",
    "sort_order", "created_at", "updated_at",
]
MACHINE_REMINDER_FIELDS = [
    "id", "machine_id", "template_id", "title", "description", "category", "interval_days",
    "last_performed_at", "next_due_at", "enabled", "is_custom", "sort_order", "notes",
    "last_notified_due_at", "created_at", "updated_at",
]
OBSIDIAN_TEMPLATE_FIELDS = [
    "id", "name", "machine_type", "description", "content", "created_at", "updated_at",
]
DOCUMENT_FIELDS = ["id", "machine_id", "template_id", "filename", "content", "created_at"]
EVENT_FIELDS = ["id", "machine_id", "event_type", "description", "actor", "created_at"]


def build_export(db: Session) -> dict:
    machines = list(db.scalars(select(Machine)))
    return {
        "format": "taskcentral-export",
        "version": EXPORT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "machines": [
            {**_row(m, MACHINE_FIELDS), "tags": [t.name for t in m.tags]} for m in machines
        ],
        "services": [_row(s, SERVICE_FIELDS) for s in db.scalars(select(Service))],
        "storage_devices": [_row(s, STORAGE_FIELDS) for s in db.scalars(select(StorageDevice))],
        "network_devices": [
            _row(d, NETWORK_DEVICE_FIELDS) for d in db.scalars(select(NetworkDevice))
        ],
        "network_segments": [
            _row(s, NETWORK_SEGMENT_FIELDS) for s in db.scalars(select(NetworkSegment))
        ],
        "dependencies": [_row(d, DEPENDENCY_FIELDS) for d in db.scalars(select(Dependency))],
        "machine_notes": [_row(n, NOTE_FIELDS) for n in db.scalars(select(MachineNote))],
        "machine_tasks": [_row(t, TASK_FIELDS) for t in db.scalars(select(MachineTask))],
        "task_templates": [
            _row(t, TASK_TEMPLATE_FIELDS) for t in db.scalars(select(TaskTemplate))
        ],
        "reminder_templates": [
            _row(t, REMINDER_TEMPLATE_FIELDS) for t in db.scalars(select(ReminderTemplate))
        ],
        "machine_reminders": [
            _row(r, MACHINE_REMINDER_FIELDS) for r in db.scalars(select(MachineReminder))
        ],
        "obsidian_templates": [
            _row(t, OBSIDIAN_TEMPLATE_FIELDS) for t in db.scalars(select(ObsidianTemplate))
        ],
        "generated_documents": [
            _row(d, DOCUMENT_FIELDS) for d in db.scalars(select(GeneratedDocument))
        ],
        "activity_events": [_row(e, EVENT_FIELDS) for e in db.scalars(select(ActivityEvent))],
        "settings": {
            row.key: json.loads(row.value)
            for row in db.scalars(select(ApplicationSetting))
            # Never export the password hash — keep it out of shareable backups.
            if row.key not in ("auth_password_hash", "llm_api_key", "setup_completed")
        },
    }


@router.get("/export")
def export_data(db: Session = Depends(get_db)):
    payload = build_export(db)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return JSONResponse(
        payload,
        headers={
            "Content-Disposition": f'attachment; filename="taskcentral-export-{stamp}.json"'
        },
    )


def _parse_dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _parse_date(value: str | None) -> date | None:
    return date.fromisoformat(value) if value else None


def validate_import(payload: dict) -> tuple[list[str], dict[str, int]]:
    errors: list[str] = []
    if payload.get("format") != "taskcentral-export":
        errors.append("Not a Task Central export file (missing format marker).")
        return errors, {}
    if payload.get("version") != EXPORT_VERSION:
        errors.append(f"Unsupported export version: {payload.get('version')}")
        return errors, {}
    summary: dict[str, int] = {}
    for key in (
        "machines", "services", "storage_devices", "network_devices", "network_segments",
        "dependencies", "machine_notes", "machine_tasks", "machine_reminders", "task_templates",
        "reminder_templates", "obsidian_templates", "generated_documents", "activity_events",
    ):
        rows = payload.get(key, [])
        if not isinstance(rows, list):
            errors.append(f"Section '{key}' must be a list.")
            continue
        summary[key] = len(rows)
    machine_ids = {m.get("id") for m in payload.get("machines", [])}
    for m in payload.get("machines", []):
        if not m.get("name") or m.get("machine_type") not in VALID_MACHINE_TYPES:
            errors.append(f"Machine record invalid: {str(m.get('name'))!r}")
    for section, fk in (
        ("services", "machine_id"),
        ("storage_devices", "machine_id"),
        ("network_devices", "machine_id"),
        ("network_segments", "machine_id"),
        ("machine_tasks", "machine_id"),
        ("machine_reminders", "machine_id"),
        ("machine_notes", "machine_id"),
        ("dependencies", "machine_id"),
        ("generated_documents", "machine_id"),
    ):
        for row in payload.get(section, []):
            if row.get(fk) not in machine_ids:
                errors.append(f"{section} row {row.get('id')} references unknown machine {row.get(fk)}.")
    if not isinstance(payload.get("settings", {}), dict):
        errors.append("Section 'settings' must be an object.")
    return errors, summary


@router.post("/import")
def import_data(
    payload: dict = Body(...),
    dry_run: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    raw_size = len(json.dumps(payload))
    if raw_size > get_settings().max_import_bytes:
        raise HTTPException(status_code=413, detail="Import file too large")
    errors, summary = validate_import(payload)
    if errors:
        limited_errors = errors[:50]
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Import validation failed: " + "; ".join(limited_errors),
                "valid": False,
                "errors": limited_errors,
                "summary": summary,
            },
        )
    if dry_run:
        return {"valid": True, "errors": [], "summary": summary, "imported": False}

    # Full replace: wipe existing data, then insert with original IDs preserved.
    for model in (
        ActivityEvent, GeneratedDocument, MachineTask, MachineReminder, MachineNote, Dependency,
        Service, StorageDevice, NetworkDevice, NetworkSegment,
    ):
        db.execute(delete(model))
    db.execute(delete(machine_tags))
    for model in (Machine, Tag, TaskTemplate, ReminderTemplate, ObsidianTemplate, ApplicationSetting):
        db.execute(delete(model))
    db.flush()

    for m in payload.get("machines", []):
        tags = m.pop("tags", [])
        machine = Machine(
            **{
                **m,
                "deployment_date": _parse_date(m.get("deployment_date")),
                "archived_at": _parse_dt(m.get("archived_at")),
                "created_at": _parse_dt(m.get("created_at")),
                "updated_at": _parse_dt(m.get("updated_at")),
            }
        )
        machine.tags = resolve_tags(db, [t for t in tags if isinstance(t, str)])
        db.add(machine)
    db.flush()

    for s in payload.get("services", []):
        db.add(Service(**{**s, "created_at": _parse_dt(s.get("created_at")), "updated_at": _parse_dt(s.get("updated_at"))}))
    for s in payload.get("storage_devices", []):
        db.add(StorageDevice(**{**s, "created_at": _parse_dt(s.get("created_at")), "updated_at": _parse_dt(s.get("updated_at"))}))
    for d in payload.get("network_devices", []):
        db.add(NetworkDevice(**{**d, "created_at": _parse_dt(d.get("created_at")), "updated_at": _parse_dt(d.get("updated_at"))}))
    for s in payload.get("network_segments", []):
        db.add(NetworkSegment(**{**s, "created_at": _parse_dt(s.get("created_at")), "updated_at": _parse_dt(s.get("updated_at"))}))
    for d in payload.get("dependencies", []):
        db.add(Dependency(**{**d, "created_at": _parse_dt(d.get("created_at")), "updated_at": _parse_dt(d.get("updated_at"))}))
    for n in payload.get("machine_notes", []):
        db.add(MachineNote(**{**n, "created_at": _parse_dt(n.get("created_at")), "updated_at": _parse_dt(n.get("updated_at"))}))
    for t in payload.get("task_templates", []):
        db.add(TaskTemplate(**{**t, "created_at": _parse_dt(t.get("created_at")), "updated_at": _parse_dt(t.get("updated_at"))}))
    for t in payload.get("reminder_templates", []):
        db.add(ReminderTemplate(**{**t, "created_at": _parse_dt(t.get("created_at")), "updated_at": _parse_dt(t.get("updated_at"))}))
    db.flush()
    template_ids = {t.id for t in db.scalars(select(TaskTemplate))}
    for t in payload.get("machine_tasks", []):
        if t.get("template_id") not in template_ids:
            t["template_id"] = None
        db.add(
            MachineTask(
                **{
                    **t,
                    "due_date": _parse_date(t.get("due_date")),
                    "completed_at": _parse_dt(t.get("completed_at")),
                    "created_at": _parse_dt(t.get("created_at")),
                    "updated_at": _parse_dt(t.get("updated_at")),
                }
            )
        )
    reminder_template_ids = {t.id for t in db.scalars(select(ReminderTemplate))}
    for r in payload.get("machine_reminders", []):
        if r.get("template_id") not in reminder_template_ids:
            r["template_id"] = None
        db.add(
            MachineReminder(
                **{
                    **r,
                    "last_performed_at": _parse_date(r.get("last_performed_at")),
                    "next_due_at": _parse_date(r.get("next_due_at")),
                    "last_notified_due_at": _parse_date(r.get("last_notified_due_at")),
                    "created_at": _parse_dt(r.get("created_at")),
                    "updated_at": _parse_dt(r.get("updated_at")),
                }
            )
        )
    for ot in payload.get("obsidian_templates", []):
        db.add(ObsidianTemplate(**{**ot, "created_at": _parse_dt(ot.get("created_at")), "updated_at": _parse_dt(ot.get("updated_at"))}))
    db.flush()
    obsidian_ids = {t.id for t in db.scalars(select(ObsidianTemplate))}
    for doc in payload.get("generated_documents", []):
        if doc.get("template_id") not in obsidian_ids:
            doc["template_id"] = None
        db.add(GeneratedDocument(**{**doc, "created_at": _parse_dt(doc.get("created_at"))}))
    for e in payload.get("activity_events", []):
        db.add(ActivityEvent(**{**e, "created_at": _parse_dt(e.get("created_at"))}))
    for key, value in payload.get("settings", {}).items():
        db.add(ApplicationSetting(key=str(key)[:120], value=json.dumps(value)))

    log_event(db, "data_imported", f"Data imported from backup file ({summary.get('machines', 0)} machines).")
    db.commit()
    return {"valid": True, "errors": [], "summary": summary, "imported": True}


@router.get("/backup")
def download_backup():
    settings = get_settings()
    url = settings.resolved_database_url
    if not url.startswith("sqlite"):
        raise HTTPException(
            status_code=400,
            detail="Database backup download is only available for SQLite. Use pg_dump for PostgreSQL.",
        )
    path = url.split("sqlite:///")[-1]
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=f"taskcentral-backup-{stamp}.db",
    )


@router.post("/clear-sample-data")
def clear_sample_data(db: Session = Depends(get_db)):
    sample_tag = db.scalar(select(Tag).where(func.lower(Tag.name) == "sample-data"))
    if sample_tag is None:
        return {"deleted": 0}
    machines = [m for m in sample_tag.machines]
    for m in machines:
        db.delete(m)
    db.delete(sample_tag)
    log_event(db, "sample_data_cleared", f"Removed {len(machines)} sample machine(s).")
    db.commit()
    return {"deleted": len(machines)}


@router.post("/reset-application")
def reset_application_data(db: Session = Depends(get_db)):
    reset_application(db)
    return {"reset": True, "setup_required": True}
