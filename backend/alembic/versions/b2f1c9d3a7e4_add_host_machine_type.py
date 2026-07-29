"""add HOST machine type

Widens the machine_type / machine_type_scope CHECK constraints to allow 'HOST'
so hypervisor hosts can be tracked as first-class machines.

Revision ID: b2f1c9d3a7e4
Revises: ce0ec588b432
Create Date: 2026-07-24

"""
from typing import Sequence, Union

from alembic import op

revision: str = "b2f1c9d3a7e4"
down_revision: Union[str, None] = "ce0ec588b432"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("machines") as batch_op:
        batch_op.drop_constraint("ck_machines_type", type_="check")
        batch_op.create_check_constraint(
            "ck_machines_type", "machine_type IN ('VM', 'LXC', 'PHYSICAL', 'HOST')"
        )
    with op.batch_alter_table("task_templates") as batch_op:
        batch_op.drop_constraint("ck_task_templates_scope", type_="check")
        batch_op.create_check_constraint(
            "ck_task_templates_scope",
            "machine_type_scope IN ('ALL', 'VM', 'LXC', 'PHYSICAL', 'HOST')",
        )
    with op.batch_alter_table("obsidian_templates") as batch_op:
        batch_op.drop_constraint("ck_obsidian_templates_type", type_="check")
        batch_op.create_check_constraint(
            "ck_obsidian_templates_type", "machine_type IN ('VM', 'LXC', 'PHYSICAL', 'HOST')"
        )


def downgrade() -> None:
    with op.batch_alter_table("obsidian_templates") as batch_op:
        batch_op.drop_constraint("ck_obsidian_templates_type", type_="check")
        batch_op.create_check_constraint(
            "ck_obsidian_templates_type", "machine_type IN ('VM', 'LXC', 'PHYSICAL')"
        )
    with op.batch_alter_table("task_templates") as batch_op:
        batch_op.drop_constraint("ck_task_templates_scope", type_="check")
        batch_op.create_check_constraint(
            "ck_task_templates_scope",
            "machine_type_scope IN ('ALL', 'VM', 'LXC', 'PHYSICAL')",
        )
    with op.batch_alter_table("machines") as batch_op:
        batch_op.drop_constraint("ck_machines_type", type_="check")
        batch_op.create_check_constraint(
            "ck_machines_type", "machine_type IN ('VM', 'LXC', 'PHYSICAL')"
        )
