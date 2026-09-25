"""Add response operations metadata, tags, notes, and source.

Revision ID: 0005_v2b_response_ops
Revises: 0004_v2b_deployments
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_v2b_response_ops"
down_revision = "0004_v2b_deployments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("source", sa.String(length=60), server_default="public", nullable=False))
    op.add_column("conversations", sa.Column("metadata", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False))
    op.add_column("conversations", sa.Column("tags", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.add_column("conversations", sa.Column("notes", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False))
    op.create_index("ix_conversations_source", "conversations", ["source"])


def downgrade() -> None:
    op.drop_index("ix_conversations_source", table_name="conversations")
    op.drop_column("conversations", "notes")
    op.drop_column("conversations", "tags")
    op.drop_column("conversations", "metadata")
    op.drop_column("conversations", "source")
