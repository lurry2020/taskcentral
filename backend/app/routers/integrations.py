"""Read-only inventory endpoints authenticated only by integration tokens."""

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import IntegrationToken, Machine, Service
from app.schemas.integrations import (
    IntegrationDependency,
    IntegrationDependent,
    IntegrationHealth,
    IntegrationMachine,
    IntegrationMachineSummary,
    IntegrationService,
    MachineContext,
    MachineServices,
    ServiceContext,
)
from app.services.integration_tokens import (
    INVENTORY_READ_SCOPE,
    authenticate_integration_token,
    mark_integration_token_used,
    parse_scopes,
)

bearer = HTTPBearer(auto_error=False)


def _authentication_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing integration token",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_integration_scope(scope: str) -> Callable:
    def dependency(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
        db: Session = Depends(get_db),
    ) -> IntegrationToken:
        if credentials is None or credentials.scheme.casefold() != "bearer":
            raise _authentication_error()
        record = authenticate_integration_token(db, credentials.credentials)
        if record is None:
            raise _authentication_error()
        if scope not in parse_scopes(record.scopes):
            raise HTTPException(status_code=403, detail="Integration token lacks required scope")
        mark_integration_token_used(db, record)
        return record

    return dependency


router = APIRouter(
    prefix="/integrations",
    tags=["integrations"],
    dependencies=[Depends(require_integration_scope(INVENTORY_READ_SCOPE))],
)


def _machine_summary(machine: Machine) -> IntegrationMachineSummary:
    return IntegrationMachineSummary(
        id=machine.id,
        name=machine.name,
        machine_type=machine.machine_type,
        status=machine.status,
        archived=machine.archived_at is not None,
        archived_at=machine.archived_at,
        purpose=machine.purpose,
        ip_address=machine.ip_address,
        mac_address=machine.mac_address,
        dns_record=machine.dns_record,
        operating_system=machine.operating_system,
        operating_system_version=machine.operating_system_version,
        architecture=machine.architecture,
        vmid=machine.vmid,
        host=machine.host,
    )


def _machine_detail(machine: Machine) -> IntegrationMachine:
    return IntegrationMachine(
        **_machine_summary(machine).model_dump(),
        hypervisor=machine.hypervisor,
        cpu=machine.cpu,
        cpu_cores=machine.cpu_cores,
        memory_value=machine.memory_value,
        memory_unit=machine.memory_unit,
        disk_value=machine.disk_value,
        disk_unit=machine.disk_unit,
        storage_location=machine.storage_location,
        network_interface=machine.network_interface,
        location=machine.location,
        tags=[tag.name for tag in machine.tags],
    )


def _service(service: Service) -> IntegrationService:
    return IntegrationService(
        id=service.id,
        machine_id=service.machine_id,
        name=service.name,
        description=service.description,
        port=service.port,
        protocol=service.protocol,
        url=service.url,
        is_external=service.is_external,
        notes=service.notes,
    )


def _dependencies(machine: Machine) -> list[IntegrationDependency]:
    return [
        IntegrationDependency(
            id=dependency.id,
            dependency_type=dependency.dependency_type,
            notes=dependency.notes,
            target_machine=(
                _machine_summary(dependency.depends_on_machine)
                if dependency.depends_on_machine is not None
                else None
            ),
            external_name=dependency.external_name,
        )
        for dependency in sorted(machine.dependencies, key=lambda item: item.id)
    ]


def _dependents(machine: Machine) -> list[IntegrationDependent]:
    return [
        IntegrationDependent(
            id=dependency.id,
            dependency_type=dependency.dependency_type,
            notes=dependency.notes,
            machine=_machine_summary(dependency.machine),
        )
        for dependency in sorted(machine.dependents, key=lambda item: item.id)
    ]


def _machine_or_404(db: Session, machine_id: int) -> Machine:
    machine = db.get(Machine, machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine


def _service_or_404(db: Session, service_id: int) -> Service:
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(status_code=404, detail="Service not found")
    return service


@router.get("/health", response_model=IntegrationHealth)
def integration_health():
    """Confirm integration-token authentication and report the running version."""
    return IntegrationHealth(
        status="ok",
        integration_api=True,
        version=get_settings().taskcentral_version,
    )


@router.get("/machines", response_model=list[IntegrationMachineSummary])
def list_machines(db: Session = Depends(get_db)):
    """Return the current, non-archived machine inventory in stable name order."""
    machines = db.scalars(
        select(Machine)
        .where(Machine.archived_at.is_(None))
        .order_by(func.lower(Machine.name), Machine.id)
    ).all()
    return [_machine_summary(machine) for machine in machines]


@router.get("/machines/{machine_id}/context", response_model=MachineContext)
def machine_context(machine_id: int, db: Session = Depends(get_db)):
    machine = _machine_or_404(db, machine_id)
    return MachineContext(
        machine=_machine_detail(machine),
        services=[
            _service(item)
            for item in sorted(machine.services, key=lambda item: (item.sort_order, item.id))
        ],
        dependencies=_dependencies(machine),
        dependents=_dependents(machine),
    )


@router.get("/machines/{machine_id}/services", response_model=MachineServices)
def machine_services(machine_id: int, db: Session = Depends(get_db)):
    machine = _machine_or_404(db, machine_id)
    return MachineServices(
        machine_id=machine.id,
        services=[
            _service(item)
            for item in sorted(machine.services, key=lambda item: (item.sort_order, item.id))
        ],
    )


@router.get("/services/lookup", response_model=ServiceContext)
def lookup_service(
    machine_id: Annotated[int, Query(ge=1)],
    name: Annotated[str, Query(min_length=1, max_length=200)],
    db: Session = Depends(get_db),
):
    normalized_name = name.strip()
    if not normalized_name:
        raise HTTPException(status_code=422, detail="Service name cannot be blank")
    _machine_or_404(db, machine_id)
    matches = [
        service
        for service in db.scalars(
            select(Service).where(Service.machine_id == machine_id).order_by(Service.id)
        )
        if service.name.casefold() == normalized_name.casefold()
    ][:2]
    if not matches:
        raise HTTPException(status_code=404, detail="Service not found")
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail="Service lookup is ambiguous")
    return _service_context(matches[0])


def _service_context(service: Service) -> ServiceContext:
    machine = service.machine
    return ServiceContext(
        service=_service(service),
        machine=_machine_summary(machine),
        dependencies=_dependencies(machine),
        dependents=_dependents(machine),
    )


@router.get("/services/{service_id}/context", response_model=ServiceContext)
def service_context(service_id: int, db: Session = Depends(get_db)):
    return _service_context(_service_or_404(db, service_id))
