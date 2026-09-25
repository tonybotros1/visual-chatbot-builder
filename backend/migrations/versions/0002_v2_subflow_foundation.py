"""Add the V2 subflow and dependency-pinning foundation.

Revision ID: 0002_v2_subflows
Revises: 0001_initial
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_v2_subflows"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subflows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_subflows_user_id", "subflows", ["user_id"])
    op.create_index("ix_subflows_slug", "subflows", ["slug"], unique=True)
    op.create_index("ix_subflows_status", "subflows", ["status"])

    op.create_table(
        "subflow_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "subflow_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subflows.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("flow_json", postgresql.JSONB(), nullable=False),
        sa.Column("input_schema", postgresql.JSONB(), nullable=False),
        sa.Column("output_schema", postgresql.JSONB(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("subflow_id", "version_number"),
    )
    op.create_index("ix_subflow_versions_subflow_id", "subflow_versions", ["subflow_id"])
    op.create_index("ix_subflow_versions_published", "subflow_versions", ["published"])

    op.create_table(
        "bot_version_dependencies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "bot_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bot_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("dependency_type", sa.String(length=40), nullable=False),
        sa.Column("dependency_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("node_id", sa.String(length=160), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "bot_version_id",
            "dependency_type",
            "dependency_version_id",
            "node_id",
        ),
    )
    op.create_index(
        "ix_bot_version_dependencies_bot_version_id",
        "bot_version_dependencies",
        ["bot_version_id"],
    )
    op.create_index(
        "ix_bot_version_dependencies_dependency_type",
        "bot_version_dependencies",
        ["dependency_type"],
    )
    op.create_index(
        "ix_bot_version_dependencies_dependency_version_id",
        "bot_version_dependencies",
        ["dependency_version_id"],
    )

    op.add_column(
        "conversations",
        sa.Column(
            "runtime_state",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("conversations", "runtime_state")
    op.drop_table("bot_version_dependencies")
    op.drop_table("subflow_versions")
    op.drop_table("subflows")
