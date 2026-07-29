from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.models.base import Base, TimestampMixin

MACHINE_TYPE_SCOPES = ("ALL", "VM", "LXC", "PHYSICAL", "HOST", "NETWORK")
TASK_STATUSES = ("Pending", "In Progress", "Completed", "Blocked", "Not Applicable")


class TaskTemplate(Base, TimestampMixin):
    __tablename__ = "task_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(60), nullable=False, default="Other", index=True)
    machine_type_scope: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ALL", index=True
    )
    required: Mapped[bool] = mapped_column(default=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "machine_type_scope IN ('ALL', 'VM', 'LXC', 'PHYSICAL', 'HOST', 'NETWORK')",
            name="ck_task_templates_scope",
        ),
    )


class MachineTask(Base, TimestampMixin):
    __tablename__ = "machine_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("task_templates.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(60), nullable=False, default="Other", index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending", index=True)
    required: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_custom: Mapped[bool] = mapped_column(default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    blocked_reason: Mapped[str | None] = mapped_column(Text)
    not_applicable_reason: Mapped[str | None] = mapped_column(Text)

    machine = relationship(
        "Machine",
        backref=backref("tasks", cascade="all, delete-orphan", passive_deletes=True),
    )
    template: Mapped[TaskTemplate | None] = relationship()

    __table_args__ = (
        CheckConstraint(
            "status IN ('Pending', 'In Progress', 'Completed', 'Blocked', 'Not Applicable')",
            name="ck_machine_tasks_status",
        ),
    )
