"""Add encrypted integrations, subscriptions, and retryable delivery outbox.

Revision ID: 0006_v2b_integrations
Revises: 0005_v2b_response_ops
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006_v2b_integrations"
down_revision = "0005_v2b_response_ops"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("integration_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(50), nullable=False), sa.Column("name", sa.String(160), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False), sa.Column("encrypted_secrets", sa.LargeBinary(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_integration_connections_user_id", "integration_connections", ["user_id"])
    op.create_index("ix_integration_connections_kind", "integration_connections", ["kind"])
    op.create_index("ix_integration_connections_status", "integration_connections", ["status"])
    op.create_table("bot_event_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("bot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("integration_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event", sa.String(80), nullable=False), sa.Column("status", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("bot_id", "connection_id", "event"))
    op.create_index("ix_bot_event_subscriptions_bot_id", "bot_event_subscriptions", ["bot_id"])
    op.create_index("ix_bot_event_subscriptions_connection_id", "bot_event_subscriptions", ["connection_id"])
    op.create_index("ix_bot_event_subscriptions_event", "bot_event_subscriptions", ["event"])
    op.create_index("ix_bot_event_subscriptions_status", "bot_event_subscriptions", ["status"])
    op.create_table("integration_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("bot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("integration_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event", sa.String(80), nullable=False), sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False), sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True), sa.Column("last_error", sa.Text(), nullable=False),
        sa.Column("response_code", sa.Integer(), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True))
    for column in ("bot_id", "conversation_id", "connection_id", "event", "status", "next_attempt_at"):
        op.create_index(f"ix_integration_deliveries_{column}", "integration_deliveries", [column])


def downgrade() -> None:
    op.drop_table("integration_deliveries")
    op.drop_table("bot_event_subscriptions")
    op.drop_table("integration_connections")
