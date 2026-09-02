from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.services.integration_tokens import SUPPORTED_SCOPES


class IntegrationTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Token name cannot be blank")
        return value

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, value: list[str]) -> list[str]:
        normalized = sorted(set(value))
        unknown = set(normalized) - SUPPORTED_SCOPES
        if unknown:
            raise ValueError(f"Unsupported scope: {sorted(unknown)[0]}")
        return normalized


class IntegrationTokenOut(BaseModel):
    id: int
    name: str
    token_prefix: str
    scopes: list[str]
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None
    active: bool


class IntegrationTokenCreated(IntegrationTokenOut):
    token: str


class IntegrationHealth(BaseModel):
    status: str
    integration_api: bool
    version: str


class IntegrationMachineSummary(BaseModel):
    id: int
    name: str
    machine_type: str
    status: str
    archived: bool
    archived_at: datetime | None
    purpose: str | None
    ip_address: str | None
    mac_address: str | None
    dns_record: str | None
    operating_system: str | None
    operating_system_version: str | None
    architecture: str | None
    vmid: int | None
    host: str | None


class IntegrationMachine(IntegrationMachineSummary):
    hypervisor: str | None
    cpu: str | None
    cpu_cores: int | None
    memory_value: float | None
    memory_unit: str | None
    disk_value: float | None
    disk_unit: str | None
    storage_location: str | None
    network_interface: str | None
    location: str | None
    tags: list[str]


class IntegrationService(BaseModel):
    id: int
    machine_id: int
    name: str
    description: str | None
    port: int | None
    protocol: str | None
    url: str | None
    is_external: bool
    notes: str | None


class IntegrationDependency(BaseModel):
    id: int
    dependency_type: str
    notes: str | None
    target_machine: IntegrationMachineSummary | None
    external_name: str | None


class IntegrationDependent(BaseModel):
    id: int
    dependency_type: str
    notes: str | None
    machine: IntegrationMachineSummary


class MachineContext(BaseModel):
    machine: IntegrationMachine
    services: list[IntegrationService]
    dependencies: list[IntegrationDependency]
    dependents: list[IntegrationDependent]


class MachineServices(BaseModel):
    machine_id: int
    services: list[IntegrationService]


class ServiceContext(BaseModel):
    service: IntegrationService
    machine: IntegrationMachineSummary
    dependencies: list[IntegrationDependency]
    dependents: list[IntegrationDependent]
