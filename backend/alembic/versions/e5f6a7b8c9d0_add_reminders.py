"""add reminder templates and machine reminders

Additive only: two new tables (reminder_templates, machine_reminders). No existing
data is modified.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-26

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reminder_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=60), nullable=False),
        sa.Column("machine_type_scope", sa.String(length=20), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "machine_type_scope IN ('ALL', 'VM', 'LXC', 'PHYSICAL', 'HOST', 'NETWORK')",
            name="ck_reminder_templates_scope",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reminder_templates_category", "reminder_templates", ["category"], unique=False
    )
    op.create_index(
        "ix_reminder_templates_machine_type_scope",
        "reminder_templates",
        ["machine_type_scope"],
        unique=False,
    )

    op.create_table(
        "machine_reminders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=60), nullable=False),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("last_performed_at", sa.Date(), nullable=True),
        sa.Column("next_due_at", sa.Date(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("is_custom", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_notified_due_at", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["reminder_templates.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_machine_reminders_machine_id", "machine_reminders", ["machine_id"], unique=False
    )
    op.create_index(
        "ix_machine_reminders_template_id", "machine_reminders", ["template_id"], unique=False
    )
    op.create_index(
        "ix_machine_reminders_category", "machine_reminders", ["category"], unique=False
    )
    op.create_index(
        "ix_machine_reminders_next_due_at", "machine_reminders", ["next_due_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_machine_reminders_next_due_at", table_name="machine_reminders")
    op.drop_index("ix_machine_reminders_category", table_name="machine_reminders")
    op.drop_index("ix_machine_reminders_template_id", table_name="machine_reminders")
    op.drop_index("ix_machine_reminders_machine_id", table_name="machine_reminders")
    op.drop_table("machine_reminders")
    op.drop_index("ix_reminder_templates_machine_type_scope", table_name="reminder_templates")
    op.drop_index("ix_reminder_templates_category", table_name="reminder_templates")
    op.drop_table("reminder_templates")
