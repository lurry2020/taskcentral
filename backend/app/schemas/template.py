from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class ObsidianTemplateUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    content: str = Field(min_length=1)


class ObsidianTemplateOut(ORMModel):
    id: int
    name: str
    machine_type: str
    description: str | None
    content: str
    created_at: datetime
    updated_at: datetime


class TemplatePreviewRequest(BaseModel):
    content: str = Field(min_length=1)


class TemplatePreviewResponse(BaseModel):
    rendered: str | None = None
    error: str | None = None


class TemplateVariable(BaseModel):
    variable: str
    description: str


class GeneratedDocumentOut(ORMModel):
    id: int
    machine_id: int
    template_id: int | None
    filename: str
    content: str
    created_at: datetime


class GeneratedDocumentListItem(ORMModel):
    id: int
    machine_id: int
    filename: str
    created_at: datetime


class ActivityEventOut(ORMModel):
    id: int
    machine_id: int | None
    event_type: str
    description: str
    created_at: datetime
