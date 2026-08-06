from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import (
    MachineStatus,
    MachineType,
    ORMModel,
    validate_ip,
    validate_mac,
)


class ServiceBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    protocol: str | None = Field(default=None, max_length=30)
    url: str | None = Field(default=None, max_length=500)
    is_external: bool = False
    notes: str | None = None
    sort_order: int = 0

    @field_validator("url")
    @classmethod
    def _url(cls, v: str | None) -> str | None:
        if not v:
            return None
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(ServiceBase):
    pass


class ServiceOut(ServiceBase, ORMModel):
    id: int
    machine_id: int
    created_at: datetime
    updated_at: datetime


class StorageBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    capacity: str | None = Field(default=None, max_length=60)
    purpose: str | None = Field(default=None, max_length=300)
    notes: str | None = None
    sort_order: int = 0


class StorageCreate(StorageBase):
    pass


class StorageUpdate(StorageBase):
    pass


class StorageOut(StorageBase, ORMModel):
    id: int
    machine_id: int
    created_at: datetime
    updated_at: datetime


class NetworkDeviceBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(default="Switch", max_length=60)
    ip_address: str | None = None
    notes: str | None = None
    sort_order: int = 0

    @field_validator("ip_address")
    @classmethod
    def _ip(cls, v: str | None) -> str | None:
        return validate_ip(v)


class NetworkDeviceCreate(NetworkDeviceBase):
    pass


class NetworkDeviceUpdate(NetworkDeviceBase):
    pass


class NetworkDeviceOut(NetworkDeviceBase, ORMModel):
    id: int
    machine_id: int
    created_at: datetime
    updated_at: datetime


class NetworkSegmentBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    vlan_id: int | None = Field(default=None, ge=1, le=4094)
    subnet: str | None = Field(default=None, max_length=60)
    purpose: str | None = Field(default=None, max_length=300)
    notes: str | None = None
    sort_order: int = 0


class NetworkSegmentCreate(NetworkSegmentBase):
    pass


class NetworkSegmentUpdate(NetworkSegmentBase):
    pass


class NetworkSegmentOut(NetworkSegmentBase, ORMModel):
    id: int
    machine_id: int
    created_at: datetime
    updated_at: datetime


class DependencyBase(BaseModel):
    depends_on_machine_id: int | None = None
    external_name: str | None = Field(default=None, max_length=200)
    dependency_type: str = Field(default="Other", max_length=50)
    notes: str | None = None


class DependencyCreate(DependencyBase):
    pass


class DependencyOut(DependencyBase, ORMModel):
    id: int
    machine_id: int
    depends_on_machine_name: str | None = None
    created_at: datetime


class ReverseDependencyOut(BaseModel):
    machine_id: int
    machine_name: str
    machine_type: str
    machine_status: str
    dependency_type: str
    notes: str | None = None


class NoteBase(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str = Field(min_length=1)


class NoteCreate(NoteBase):
    pass


class NoteUpdate(NoteBase):
    pass


class NoteOut(NoteBase, ORMModel):
    id: int
    machine_id: int
    created_at: datetime
    updated_at: datetime


class MachineBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    machine_type: MachineType
    status: MachineStatus = MachineStatus.DRAFT
    host: str | None = Field(default=None, max_length=200)
    vmid: int | None = Field(default=None, ge=1, le=999999999)
    ip_address: str | None = None
    mac_address: str | None = None
    dns_record: str | None = Field(default=None, max_length=255)
    operating_system: str | None = Field(default=None, max_length=120)
    operating_system_version: str | None = Field(default=None, max_length=120)
    hypervisor: str | None = Field(default=None, max_length=160)
    architecture: str | None = Field(default=None, max_length=40)
    purpose: str | None = None
    responsibilities: str | None = None
    isp: str | None = Field(default=None, max_length=200)
    connection_type: str | None = Field(default=None, max_length=120)
    download_speed: str | None = Field(default=None, max_length=60)
    upload_speed: str | None = Field(default=None, max_length=60)
    wan_type: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=200)
    owner: str | None = Field(default=None, max_length=200)
    deployment_date: date | None = None
    cpu: str | None = Field(default=None, max_length=200)
    cpu_cores: int | None = Field(default=None, ge=1, le=4096)
    memory_value: float | None = Field(default=None, gt=0)
    memory_unit: str | None = Field(default=None, max_length=10)
    disk_value: float | None = Field(default=None, gt=0)
    disk_unit: str | None = Field(default=None, max_length=10)
    storage_location: str | None = Field(default=None, max_length=200)
    gpu: str | None = Field(default=None, max_length=200)
    network_interface: str | None = Field(default=None, max_length=120)
    hardware_model: str | None = Field(default=None, max_length=200)
    serial_number: str | None = Field(default=None, max_length=120)
    asset_tag: str | None = Field(default=None, max_length=120)
    tags: list[str] = Field(default_factory=list)

    @field_validator("ip_address")
    @classmethod
    def _ip(cls, v: str | None) -> str | None:
        return validate_ip(v)

    @field_validator("mac_address")
    @classmethod
    def _mac(cls, v: str | None) -> str | None:
        return validate_mac(v)

    @field_validator("tags")
    @classmethod
    def _tags(cls, v: list[str]) -> list[str]:
        cleaned = []
        for tag in v:
            tag = tag.strip()
            if tag and tag.lower() not in [c.lower() for c in cleaned]:
                cleaned.append(tag[:100])
        return cleaned


class MachineCreate(MachineBase):
    services: list[ServiceCreate] = Field(default_factory=list)
    storage: list[StorageCreate] = Field(default_factory=list)
    network_devices: list[NetworkDeviceCreate] = Field(default_factory=list)
    network_segments: list[NetworkSegmentCreate] = Field(default_factory=list)
    dependencies: list[DependencyCreate] = Field(default_factory=list)
    generate_checklist: bool = True


class MachineUpdate(MachineBase):
    pass


class ChecklistProgress(BaseModel):
    total_tasks: int = 0
    applicable_tasks: int = 0
    completed_tasks: int = 0
    pending_tasks: int = 0
    blocked_tasks: int = 0
    progress_percent: int = 0


class MachineListItem(ORMModel):
    id: int
    name: str
    machine_type: str
    status: str
    host: str | None
    vmid: int | None
    ip_address: str | None
    dns_record: str | None
    operating_system: str | None
    operating_system_version: str | None
    tags: list[str] = []
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    progress: ChecklistProgress = ChecklistProgress()

    @field_validator("tags", mode="before")
    @classmethod
    def _tag_names(cls, v):
        return [t.name if hasattr(t, "name") else t for t in v]


class MachineOut(MachineBase, ORMModel):
    id: int
    archived_at: datetime | None
    obsidian_document_needs_regeneration: bool
    created_at: datetime
    updated_at: datetime
    progress: ChecklistProgress = ChecklistProgress()
    warnings: list[str] = []

    @field_validator("tags", mode="before")
    @classmethod
    def _tag_names(cls, v):
        return [t.name if hasattr(t, "name") else t for t in v]


class MachineConnectivity(BaseModel):
    status: Literal["online", "offline", "unknown"]
    ip_address: str | None
    checked_at: datetime
    latency_ms: float | None = None
    message: str


class MachineConnectivityListItem(MachineConnectivity):
    machine_id: int


class DuplicateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    copy_services: bool = True
    copy_dependencies: bool = True


class ValidationWarnings(BaseModel):
    warnings: list[str]
