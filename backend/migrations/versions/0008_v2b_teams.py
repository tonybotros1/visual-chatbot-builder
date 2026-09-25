"""Add bot collaborators, roles, and audit log.

Revision ID: 0008_v2b_teams
Revises: 0007_v2b_providers
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_v2b_teams"
down_revision = "0007_v2b_providers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("bot_collaborators",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("bot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("role", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.UniqueConstraint("bot_id", "user_id"))
    for column in ("bot_id", "user_id", "role"): op.create_index(f"ix_bot_collaborators_{column}", "bot_collaborators", [column])
    op.create_table("audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("bot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True), sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(80), nullable=False), sa.Column("entity_id", sa.String(160), nullable=False), sa.Column("details", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    for column in ("bot_id", "user_id", "action", "created_at"): op.create_index(f"ix_audit_logs_{column}", "audit_logs", [column])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("bot_collaborators")
