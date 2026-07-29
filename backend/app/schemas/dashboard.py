from datetime import datetime

from pydantic import BaseModel

from app.schemas.machine import ChecklistProgress


class DashboardSummary(BaseModel):
    total_machines: int
    active_deployments: int
    completed_deployments: int
    incomplete_tasks: int
    overdue_tasks: int
    pending_tasks: int
    blocked_tasks: int


class AttentionItem(BaseModel):
    machine_id: int
    machine_name: str
    machine_type: str
    status: str
    reasons: list[str]


class RecentMachine(BaseModel):
    id: int
    name: str
    machine_type: str
    status: str
    host: str | None
    ip_address: str | None
    updated_at: datetime
    progress: ChecklistProgress


class DashboardResponse(BaseModel):
    summary: DashboardSummary
    recent_machines: list[RecentMachine]
    needs_attention: list[AttentionItem]
