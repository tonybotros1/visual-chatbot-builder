"""Add SMS OTP challenges.

Revision ID: 0011_v2b_otp
Revises: 0010_v2b_provider_connections
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0011_v2b_otp"
down_revision = "0010_v2b_provider_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("otp_challenges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", sa.String(160), nullable=False), sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("integration_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phone", sa.String(80), nullable=False), sa.Column("code_hash", sa.String(128), nullable=False), sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("verified", sa.Boolean(), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    for column in ("conversation_id", "node_id", "connection_id", "verified", "expires_at"): op.create_index(f"ix_otp_challenges_{column}", "otp_challenges", [column])


def downgrade() -> None:
    op.drop_table("otp_challenges")
