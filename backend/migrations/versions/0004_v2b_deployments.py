"""Add deployment channels and reusable targeting segments.

Revision ID: 0004_v2b_deployments
Revises: 0003_v2_logic_testing
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0004_v2b_deployments"
down_revision = "0003_v2_logic_testing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "target_segments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("rules", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_target_segments_user_id", "target_segments", ["user_id"])
    op.create_index("ix_target_segments_slug", "target_segments", ["slug"], unique=True)
    op.create_index("ix_target_segments_status", "target_segments", ["status"])

    op.create_table(
        "deployments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("bot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bot_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bot_versions.id"), nullable=False),
        sa.Column("target_segment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("target_segments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("deployment_key", sa.String(length=120), nullable=False),
        sa.Column("mode", sa.String(length=30), nullable=False),
        sa.Column("environment", sa.String(length=30), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False),
        sa.Column("rules", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_deployments_bot_id", "deployments", ["bot_id"])
    op.create_index("ix_deployments_bot_version_id", "deployments", ["bot_version_id"])
    op.create_index("ix_deployments_deployment_key", "deployments", ["deployment_key"], unique=True)
    op.create_index("ix_deployments_mode", "deployments", ["mode"])
    op.create_index("ix_deployments_environment", "deployments", ["environment"])
    op.create_index("ix_deployments_status", "deployments", ["status"])


def downgrade() -> None:
    op.drop_table("deployments")
    op.drop_table("target_segments")

