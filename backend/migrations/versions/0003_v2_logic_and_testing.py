"""Add versioned logic assets and automated bot scenarios.

Revision ID: 0003_v2_logic_testing
Revises: 0002_v2_subflows
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_v2_logic_testing"
down_revision = "0002_v2_subflows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "logic_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_logic_assets_user_id", "logic_assets", ["user_id"])
    op.create_index("ix_logic_assets_kind", "logic_assets", ["kind"])
    op.create_index("ix_logic_assets_slug", "logic_assets", ["slug"], unique=True)
    op.create_index("ix_logic_assets_status", "logic_assets", ["status"])

    op.create_table(
        "logic_asset_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "logic_asset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("logic_assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("definition", postgresql.JSONB(), nullable=False),
        sa.Column("input_schema", postgresql.JSONB(), nullable=False),
        sa.Column("output_schema", postgresql.JSONB(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("logic_asset_id", "version_number"),
    )
    op.create_index("ix_logic_asset_versions_logic_asset_id", "logic_asset_versions", ["logic_asset_id"])
    op.create_index("ix_logic_asset_versions_published", "logic_asset_versions", ["published"])

    op.create_table(
        "bot_test_scenarios",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "bot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("answers", postgresql.JSONB(), nullable=False),
        sa.Column("expected", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_bot_test_scenarios_bot_id", "bot_test_scenarios", ["bot_id"])


def downgrade() -> None:
    op.drop_table("bot_test_scenarios")
    op.drop_table("logic_asset_versions")
    op.drop_table("logic_assets")
