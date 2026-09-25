"""Attach payment and appointment records to encrypted provider connections.

Revision ID: 0010_v2b_provider_connections
Revises: 0009_v2b_localization
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_v2b_provider_connections"
down_revision = "0009_v2b_localization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payment_transactions", sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("integration_connections.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_payment_transactions_connection_id", "payment_transactions", ["connection_id"])
    op.add_column("appointment_reservations", sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("integration_connections.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_appointment_reservations_connection_id", "appointment_reservations", ["connection_id"])


def downgrade() -> None:
    op.drop_index("ix_appointment_reservations_connection_id", table_name="appointment_reservations")
    op.drop_column("appointment_reservations", "connection_id")
    op.drop_index("ix_payment_transactions_connection_id", table_name="payment_transactions")
    op.drop_column("payment_transactions", "connection_id")
