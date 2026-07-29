from sqlalchemy import CheckConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ObsidianTemplate(Base, TimestampMixin):
    __tablename__ = "obsidian_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    machine_type: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "machine_type IN ('VM', 'LXC', 'PHYSICAL', 'HOST', 'NETWORK')",
            name="ck_obsidian_templates_type",
        ),
    )
