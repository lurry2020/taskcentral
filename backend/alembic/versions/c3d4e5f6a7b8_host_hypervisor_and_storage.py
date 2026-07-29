"""host hypervisor field and storage devices

Adds machines.hypervisor and the storage_devices table (drives with capacity /
purpose) so hypervisor hosts can document all of their disks.

Revision ID: c3d4e5f6a7b8
Revises: b2f1c9d3a7e4
Create Date: 2026-07-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2f1c9d3a7e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("machines") as batch_op:
        batch_op.add_column(sa.Column("hypervisor", sa.String(length=160), nullable=True))

    op.create_table(
        "storage_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("capacity", sa.String(length=60), nullable=True),
        sa.Column("purpose", sa.String(length=300), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_storage_devices_machine_id", "storage_devices", ["machine_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_storage_devices_machine_id", table_name="storage_devices")
    op.drop_table("storage_devices")
    with op.batch_alter_table("machines") as batch_op:
        batch_op.drop_column("hypervisor")
