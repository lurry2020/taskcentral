import ipaddress
import re
from enum import Enum
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$")


class MachineType(str, Enum):
    VM = "VM"
    LXC = "LXC"
    PHYSICAL = "PHYSICAL"
    HOST = "HOST"
    NETWORK = "NETWORK"


class MachineStatus(str, Enum):
    DRAFT = "Draft"
    IN_PROGRESS = "In Progress"
    ACTIVE = "Active"
    MAINTENANCE = "Maintenance"
    RETIRED = "Retired"
    ARCHIVED = "Archived"


class TaskStatus(str, Enum):
    PENDING = "Pending"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    BLOCKED = "Blocked"
    NOT_APPLICABLE = "Not Applicable"


class TemplateScope(str, Enum):
    ALL = "ALL"
    VM = "VM"
    LXC = "LXC"
    PHYSICAL = "PHYSICAL"
    HOST = "HOST"
    NETWORK = "NETWORK"


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


def validate_ip(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    try:
        ipaddress.ip_address(value.strip())
    except ValueError as exc:
        raise ValueError(f"Invalid IP address: {value}") from exc
    return value.strip()


def validate_mac(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not MAC_RE.match(value.strip()):
        raise ValueError(f"Invalid MAC address: {value}")
    return value.strip().upper()
