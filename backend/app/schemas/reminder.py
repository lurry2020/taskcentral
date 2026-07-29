from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel, TemplateScope


class ReminderTemplateBase(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    category: str = Field(default="Other", max_length=60)
    machine_type_scope: TemplateScope = TemplateScope.ALL
    interval_days: int = Field(default=30, ge=1, le=3650)
    enabled: bool = True
    sort_order: int = 0


class ReminderTemplateCreate(ReminderTemplateBase):
    pass


class ReminderTemplateUpdate(ReminderTemplateBase):
    pass


class ReminderTemplateOut(ReminderTemplateBase, ORMModel):
    id: int
    created_at: datetime
    updated_at: datetime


class MachineReminderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    category: str = Field(default="Other", max_length=60)
    interval_days: int = Field(default=30, ge=1, le=3650)
    last_performed_at: date | None = None
    next_due_at: date | None = None
    enabled: bool = True
    notes: str | None = None


class MachineReminderUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    category: str | None = Field(default=None, max_length=60)
    interval_days: int | None = Field(default=None, ge=1, le=3650)
    last_performed_at: date | None = None
    next_due_at: date | None = None
    enabled: bool | None = None
    notes: str | None = None


class MachineReminderOut(ORMModel):
    id: int
    machine_id: int
    template_id: int | None
    title: str
    description: str | None
    category: str
    interval_days: int
    last_performed_at: date | None
    next_due_at: date | None
    enabled: bool
    is_custom: bool
    sort_order: int
    notes: str | None
    created_at: datetime
    updated_at: datetime


class ApplyRemindersPreview(BaseModel):
    reminders: list[ReminderTemplateOut]


class ApplyRemindersResult(BaseModel):
    added: list[MachineReminderOut]
