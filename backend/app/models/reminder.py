from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ReminderTemplate(Base, TimestampMixin):
    """A recurring-maintenance reminder copied onto machines of a given type."""

    __tablename__ = "reminder_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(60), nullable=False, default="Other", index=True)
    machine_type_scope: Mapped[str] = mapped_column(
        String(20), nullable=False, default="ALL", index=True
    )
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "machine_type_scope IN ('ALL', 'VM', 'LXC', 'PHYSICAL', 'HOST', 'NETWORK')",
            name="ck_reminder_templates_scope",
        ),
    )


class MachineReminder(Base, TimestampMixin):
    """A per-machine recurring reminder, tracked by last-performed / next-due dates."""

    __tablename__ = "machine_reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("reminder_templates.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(60), nullable=False, default="Other", index=True)
    interval_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    last_performed_at: Mapped[date | None] = mapped_column(Date)
    next_due_at: Mapped[date | None] = mapped_column(Date, index=True)
    enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_custom: Mapped[bool] = mapped_column(default=False, nullable=False)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    # The due date we last sent a Telegram notification for (one ping per cycle).
    last_notified_due_at: Mapped[date | None] = mapped_column(Date)

    machine = relationship(
        "Machine",
        backref=backref("reminders", cascade="all, delete-orphan", passive_deletes=True),
    )
    template: Mapped[ReminderTemplate | None] = relationship()
