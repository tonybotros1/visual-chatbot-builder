"""Workspaces: folders of bots on the dashboard.

Revision ID: 0015_workspaces
Revises: 0014_platform_admin
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0015_workspaces"
down_revision = "0014_platform_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "name", name="uq_workspaces_user_id_name"),
    )
    op.create_index("ix_workspaces_user_id", "workspaces", ["user_id"])
    op.add_column(
        "bots",
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_bots_workspace_id", "bots", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_bots_workspace_id", table_name="bots")
    op.drop_column("bots", "workspace_id")
    op.drop_index("ix_workspaces_user_id", table_name="workspaces")
    op.drop_table("workspaces")
