from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, backref, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class GeneratedDocument(Base, TimestampMixin):
    __tablename__ = "generated_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), nullable=False, index=True
    )
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("obsidian_templates.id", ondelete="SET NULL")
    )
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    machine = relationship(
        "Machine",
        backref=backref("generated_documents", cascade="all, delete-orphan", passive_deletes=True),
    )


class ActivityEvent(Base, TimestampMixin):
    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int | None] = mapped_column(
        ForeignKey("machines.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # Single-user today; actor exists so attribution can be added later.
    actor: Mapped[str | None] = mapped_column(String(120))

    machine = relationship(
        "Machine",
        backref=backref("activity_events", cascade="all, delete-orphan", passive_deletes=True),
    )


class ApplicationSetting(Base, TimestampMixin):
    __tablename__ = "application_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
