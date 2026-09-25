"""Add verified custom domains for deployments.

Revision ID: 0013_v2b_custom_domains
Revises: 0012_v2b_object_storage
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0013_v2b_custom_domains"
down_revision = "0012_v2b_object_storage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("custom_domains",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("deployment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("deployments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("hostname", sa.String(253), nullable=False), sa.Column("verification_token", sa.String(160), nullable=False), sa.Column("status", sa.String(30), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_custom_domains_deployment_id", "custom_domains", ["deployment_id"])
    op.create_index("ix_custom_domains_hostname", "custom_domains", ["hostname"], unique=True)
    op.create_index("ix_custom_domains_status", "custom_domains", ["status"])


def downgrade() -> None:
    op.drop_table("custom_domains")
