"""Add secure file, payment, and appointment provider records.

Revision ID: 0007_v2b_providers
Revises: 0006_v2b_integrations
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_v2b_providers"
down_revision = "0006_v2b_integrations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("stored_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", sa.String(160), nullable=False), sa.Column("original_name", sa.String(500), nullable=False), sa.Column("mime_type", sa.String(200), nullable=False),
        sa.Column("size", sa.BigInteger(), nullable=False), sa.Column("storage_key", sa.String(500), nullable=False, unique=True), sa.Column("scan_status", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    for column in ("conversation_id", "node_id", "scan_status"): op.create_index(f"ix_stored_files_{column}", "stored_files", [column])
    op.create_table("payment_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", sa.String(160), nullable=False), sa.Column("provider", sa.String(40), nullable=False), sa.Column("provider_reference", sa.String(240), nullable=False, unique=True),
        sa.Column("amount_minor", sa.Integer(), nullable=False), sa.Column("currency", sa.String(3), nullable=False), sa.Column("status", sa.String(30), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    for column in ("conversation_id", "node_id", "provider", "provider_reference", "status"): op.create_index(f"ix_payment_transactions_{column}", "payment_transactions", [column])
    op.create_table("appointment_reservations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("node_id", sa.String(160), nullable=False), sa.Column("provider", sa.String(50), nullable=False), sa.Column("calendar_reference", sa.String(240), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False), sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False), sa.Column("timezone", sa.String(80), nullable=False),
        sa.Column("status", sa.String(30), nullable=False), sa.Column("details", postgresql.JSONB(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("provider", "calendar_reference", "starts_at"))
    for column in ("conversation_id", "node_id", "provider", "starts_at", "ends_at", "status"): op.create_index(f"ix_appointment_reservations_{column}", "appointment_reservations", [column])


def downgrade() -> None:
    op.drop_table("appointment_reservations")
    op.drop_table("payment_transactions")
    op.drop_table("stored_files")
