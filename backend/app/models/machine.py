from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

machine_tags = Table(
    "machine_tags",
    Base.metadata,
    Column("machine_id", ForeignKey("machines.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base, TimestampMixin):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)

    machines: Mapped[list["Machine"]] = relationship(secondary=machine_tags, back_populates="tags")


class Machine(Base, TimestampMixin):
    __tablename__ = "machines"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    machine_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Draft", index=True)

    host: Mapped[str | None] = mapped_column(String(200), index=True)
    vmid: Mapped[int | None] = mapped_column(Integer)
    ip_address: Mapped[str | None] = mapped_column(String(45), index=True)
    mac_address: Mapped[str | None] = mapped_column(String(23))
    dns_record: Mapped[str | None] = mapped_column(String(255), index=True)
    operating_system: Mapped[str | None] = mapped_column(String(120))
    operating_system_version: Mapped[str | None] = mapped_column(String(120))
    hypervisor: Mapped[str | None] = mapped_column(String(160))
    architecture: Mapped[str | None] = mapped_column(String(40))
    purpose: Mapped[str | None] = mapped_column(Text)

    # Network-type fields (router / internet connection)
    responsibilities: Mapped[str | None] = mapped_column(Text)
    isp: Mapped[str | None] = mapped_column(String(200))
    connection_type: Mapped[str | None] = mapped_column(String(120))
    download_speed: Mapped[str | None] = mapped_column(String(60))
    upload_speed: Mapped[str | None] = mapped_column(String(60))
    wan_type: Mapped[str | None] = mapped_column(String(120))
    location: Mapped[str | None] = mapped_column(String(200))
    owner: Mapped[str | None] = mapped_column(String(200))
    deployment_date: Mapped[date | None] = mapped_column(Date)

    cpu: Mapped[str | None] = mapped_column(String(200))
    cpu_cores: Mapped[int | None] = mapped_column(Integer)
    memory_value: Mapped[float | None] = mapped_column(Float)
    memory_unit: Mapped[str | None] = mapped_column(String(10))
    disk_value: Mapped[float | None] = mapped_column(Float)
    disk_unit: Mapped[str | None] = mapped_column(String(10))
    storage_location: Mapped[str | None] = mapped_column(String(200))
    gpu: Mapped[str | None] = mapped_column(String(200))
    network_interface: Mapped[str | None] = mapped_column(String(120))
    hardware_model: Mapped[str | None] = mapped_column(String(200))
    serial_number: Mapped[str | None] = mapped_column(String(120))
    asset_tag: Mapped[str | None] = mapped_column(String(120))

    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    tags: Mapped[list[Tag]] = relationship(
        secondary=machine_tags, back_populates="machines", order_by=Tag.name, lazy="selectin"
    )
    services: Mapped[list["Service"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan", order_by="Service.sort_order"
    )
    storage: Mapped[list["StorageDevice"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan", order_by="StorageDevice.sort_order"
    )
    network_devices: Mapped[list["NetworkDevice"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan", order_by="NetworkDevice.sort_order"
    )
    network_segments: Mapped[list["NetworkSegment"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan", order_by="NetworkSegment.sort_order"
    )
    dependencies: Mapped[list["Dependency"]] = relationship(
        back_populates="machine",
        cascade="all, delete-orphan",
        foreign_keys="Dependency.machine_id",
    )
    dependents: Mapped[list["Dependency"]] = relationship(
        back_populates="depends_on_machine",
        foreign_keys="Dependency.depends_on_machine_id",
    )
    notes: Mapped[list["MachineNote"]] = relationship(
        back_populates="machine", cascade="all, delete-orphan", order_by="MachineNote.created_at"
    )

    __table_args__ = (
        CheckConstraint(
            "machine_type IN ('VM', 'LXC', 'PHYSICAL', 'HOST', 'NETWORK')", name="ck_machines_type"
        ),
    )


class Service(Base, TimestampMixin):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    port: Mapped[int | None] = mapped_column(Integer)
    protocol: Mapped[str | None] = mapped_column(String(30))
    url: Mapped[str | None] = mapped_column(String(500))
    is_external: Mapped[bool] = mapped_column(default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)

    machine: Mapped[Machine] = relationship(back_populates="services")

    __table_args__ = (
        CheckConstraint("port IS NULL OR (port >= 1 AND port <= 65535)", name="ck_services_port"),
    )


class StorageDevice(Base, TimestampMixin):
    __tablename__ = "storage_devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    capacity: Mapped[str | None] = mapped_column(String(60))
    purpose: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)

    machine: Mapped[Machine] = relationship(back_populates="storage")


class NetworkDevice(Base, TimestampMixin):
    """A piece of network equipment (switch, access point, router, ONT, …)."""

    __tablename__ = "network_devices"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(60), nullable=False, default="Switch")
    ip_address: Mapped[str | None] = mapped_column(String(45))
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)

    machine: Mapped[Machine] = relationship(back_populates="network_devices")


class NetworkSegment(Base, TimestampMixin):
    """A network segment / VLAN."""

    __tablename__ = "network_segments"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    vlan_id: Mapped[int | None] = mapped_column(Integer)
    subnet: Mapped[str | None] = mapped_column(String(60))
    purpose: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)

    machine: Mapped[Machine] = relationship(back_populates="network_segments")


class Dependency(Base, TimestampMixin):
    __tablename__ = "dependencies"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    depends_on_machine_id: Mapped[int | None] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), index=True
    )
    external_name: Mapped[str | None] = mapped_column(String(200))
    dependency_type: Mapped[str] = mapped_column(String(50), nullable=False, default="Other")
    notes: Mapped[str | None] = mapped_column(Text)

    machine: Mapped[Machine] = relationship(back_populates="dependencies", foreign_keys=[machine_id])
    depends_on_machine: Mapped[Machine | None] = relationship(
        back_populates="dependents", foreign_keys=[depends_on_machine_id]
    )

    __table_args__ = (
        CheckConstraint(
            "depends_on_machine_id IS NOT NULL OR external_name IS NOT NULL",
            name="ck_dependencies_target",
        ),
        CheckConstraint(
            "depends_on_machine_id IS NULL OR depends_on_machine_id != machine_id",
            name="ck_dependencies_no_self",
        ),
        UniqueConstraint("machine_id", "depends_on_machine_id", name="uq_dependencies_machine_pair"),
    )


class MachineNote(Base, TimestampMixin):
    __tablename__ = "machine_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text, nullable=False)

    machine: Mapped[Machine] = relationship(back_populates="notes")
