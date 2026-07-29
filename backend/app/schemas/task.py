from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMModel, TaskStatus, TemplateScope


class TaskTemplateBase(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    category: str = Field(default="Other", max_length=60)
    machine_type_scope: TemplateScope = TemplateScope.ALL
    required: bool = True
    enabled: bool = True
    sort_order: int = 0


class TaskTemplateCreate(TaskTemplateBase):
    pass


class TaskTemplateUpdate(TaskTemplateBase):
    pass


class TaskTemplateOut(TaskTemplateBase, ORMModel):
    id: int
    created_at: datetime
    updated_at: datetime


class MachineTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    category: str = Field(default="Other", max_length=60)
    required: bool = False
    due_date: date | None = None
    notes: str | None = None


class MachineTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    category: str | None = Field(default=None, max_length=60)
    status: TaskStatus | None = None
    required: bool | None = None
    due_date: date | None = None
    notes: str | None = None
    blocked_reason: str | None = None
    not_applicable_reason: str | None = None

    @model_validator(mode="after")
    def _blocked_needs_reason(self):
        if self.status == TaskStatus.BLOCKED and not (self.blocked_reason or "").strip():
            raise ValueError("A reason is required when marking a task Blocked")
        return self


class MachineTaskOut(ORMModel):
    id: int
    machine_id: int
    template_id: int | None
    title: str
    description: str | None
    category: str
    status: str
    required: bool
    is_custom: bool
    sort_order: int
    due_date: date | None
    completed_at: datetime | None
    notes: str | None
    blocked_reason: str | None
    not_applicable_reason: str | None
    created_at: datetime
    updated_at: datetime


class TaskReorderRequest(BaseModel):
    task_ids: list[int] = Field(min_length=1)


class ApplyTemplatesPreview(BaseModel):
    tasks: list[TaskTemplateOut]


class ApplyTemplatesResult(BaseModel):
    added: list[MachineTaskOut]
