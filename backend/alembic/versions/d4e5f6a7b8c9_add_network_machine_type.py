"""add NETWORK machine type

Additive only: widens the machine_type / scope / obsidian-type CHECK constraints to
allow 'NETWORK', adds network-specific columns to machines, and creates the
network_devices and network_segments tables. No existing data is modified.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NETWORK_COLUMNS = [
    ("responsibilities", sa.Text()),
    ("isp", sa.String(length=200)),
    ("connection_type", sa.String(length=120)),
    ("download_speed", sa.String(length=60)),
    ("upload_speed", sa.String(length=60)),
    ("wan_type", sa.String(length=120)),
]


def upgrade() -> None:
    with op.batch_alter_table("machines") as batch_op:
        for name, coltype in NETWORK_COLUMNS:
            batch_op.add_column(sa.Column(name, coltype, nullable=True))
        batch_op.drop_constraint("ck_machines_type", type_="check")
        batch_op.create_check_constraint(
            "ck_machines_type",
            "machine_type IN ('VM', 'LXC', 'PHYSICAL', 'HOST', 'NETWORK')",
        )
    with op.batch_alter_table("task_templates") as batch_op:
        batch_op.drop_constraint("ck_task_templates_scope", type_="check")
        batch_op.create_check_constraint(
            "ck_task_templates_scope",
            "machine_type_scope IN ('ALL', 'VM', 'LXC', 'PHYSICAL', 'HOST', 'NETWORK')",
        )
    with op.batch_alter_table("obsidian_templates") as batch_op:
        batch_op.drop_constraint("ck_obsidian_templates_type", type_="check")
        batch_op.create_check_constraint(
            "ck_obsidian_templates_type",
            "machine_type IN ('VM', 'LXC', 'PHYSICAL', 'HOST', 'NETWORK')",
        )

    op.create_table(
        "network_devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("role", sa.String(length=60), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_network_devices_machine_id", "network_devices", ["machine_id"])

    op.create_table(
        "network_segments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("machine_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("vlan_id", sa.Integer(), nullable=True),
        sa.Column("subnet", sa.String(length=60), nullable=True),
        sa.Column("purpose", sa.String(length=300), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_network_segments_machine_id", "network_segments", ["machine_id"])


def downgrade() -> None:
    op.drop_index("ix_network_segments_machine_id", table_name="network_segments")
    op.drop_table("network_segments")
    op.drop_index("ix_network_devices_machine_id", table_name="network_devices")
    op.drop_table("network_devices")
    with op.batch_alter_table("obsidian_templates") as batch_op:
        batch_op.drop_constraint("ck_obsidian_templates_type", type_="check")
        batch_op.create_check_constraint(
            "ck_obsidian_templates_type", "machine_type IN ('VM', 'LXC', 'PHYSICAL', 'HOST')"
        )
    with op.batch_alter_table("task_templates") as batch_op:
        batch_op.drop_constraint("ck_task_templates_scope", type_="check")
        batch_op.create_check_constraint(
            "ck_task_templates_scope",
            "machine_type_scope IN ('ALL', 'VM', 'LXC', 'PHYSICAL', 'HOST')",
        )
    with op.batch_alter_table("machines") as batch_op:
        batch_op.drop_constraint("ck_machines_type", type_="check")
        batch_op.create_check_constraint(
            "ck_machines_type", "machine_type IN ('VM', 'LXC', 'PHYSICAL', 'HOST')"
        )
        for name, _ in NETWORK_COLUMNS:
            batch_op.drop_column(name)
