from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import GeneratedDocument, Machine
from app.schemas.dashboard import (
    AttentionItem,
    DashboardResponse,
    DashboardSummary,
    RecentMachine,
)
from app.schemas.machine import ChecklistProgress
from app.services.checklist import checklist_progress

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardResponse)
def dashboard(db: Session = Depends(get_db)):
    machines = list(
        db.scalars(
            select(Machine)
            .options(selectinload(Machine.tasks))
            .where(Machine.archived_at.is_(None))
        )
    )
    documented_ids = set(db.scalars(select(GeneratedDocument.machine_id).distinct()))

    incomplete = overdue = pending = blocked = 0
    completed_deployments = 0
    attention: list[AttentionItem] = []
    today = date.today()

    for m in machines:
        progress = checklist_progress(m.tasks)
        pending += progress["pending_tasks"]
        blocked += progress["blocked_tasks"]
        remaining = progress["applicable_tasks"] - progress["completed_tasks"]
        incomplete += remaining
        overdue += len(
            [
                t
                for t in m.tasks
                if t.due_date is not None
                and t.due_date < today
                and t.status not in ("Completed", "Not Applicable")
            ]
        )
        if progress["applicable_tasks"] > 0 and remaining == 0:
            completed_deployments += 1

        reasons: list[str] = []
        if progress["blocked_tasks"]:
            reasons.append(f"{progress['blocked_tasks']} blocked task(s)")
        if remaining > 0 and m.status not in ("Draft",):
            reasons.append(f"{remaining} incomplete task(s)")
        missing_fields = [
            label
            for label, value in (("IP address", m.ip_address), ("DNS record", m.dns_record))
            if not value
        ]
        if m.machine_type in ("VM", "LXC") and not m.vmid:
            missing_fields.append("VMID")
        if missing_fields and m.status not in ("Draft", "Retired"):
            reasons.append(f"Missing: {', '.join(missing_fields)}")
        if m.id not in documented_ids and m.status not in ("Draft",):
            reasons.append("No Obsidian document generated")
        elif m.obsidian_document_needs_regeneration:
            reasons.append("Obsidian document needs regeneration")
        if reasons:
            attention.append(
                AttentionItem(
                    machine_id=m.id,
                    machine_name=m.name,
                    machine_type=m.machine_type,
                    status=m.status,
                    reasons=reasons,
                )
            )

    recent = sorted(machines, key=lambda m: m.updated_at, reverse=True)[:8]
    return DashboardResponse(
        summary=DashboardSummary(
            total_machines=len(machines),
            active_deployments=len([m for m in machines if m.status == "In Progress"]),
            completed_deployments=completed_deployments,
            incomplete_tasks=incomplete,
            overdue_tasks=overdue,
            pending_tasks=pending,
            blocked_tasks=blocked,
        ),
        recent_machines=[
            RecentMachine(
                id=m.id,
                name=m.name,
                machine_type=m.machine_type,
                status=m.status,
                host=m.host,
                ip_address=m.ip_address,
                updated_at=m.updated_at,
                progress=ChecklistProgress(**checklist_progress(m.tasks)),
            )
            for m in recent
        ],
        needs_attention=attention[:10],
    )
