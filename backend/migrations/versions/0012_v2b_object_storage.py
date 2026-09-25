"""Attach uploaded files to local or S3-compatible storage.

Revision ID: 0012_v2b_object_storage
Revises: 0011_v2b_otp
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0012_v2b_object_storage"
down_revision = "0011_v2b_otp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stored_files", sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("integration_connections.id", ondelete="SET NULL"), nullable=True))
    op.add_column("stored_files", sa.Column("storage_provider", sa.String(40), server_default="local", nullable=False))
    op.create_index("ix_stored_files_connection_id", "stored_files", ["connection_id"])
    op.create_index("ix_stored_files_storage_provider", "stored_files", ["storage_provider"])


def downgrade() -> None:
    op.drop_index("ix_stored_files_storage_provider", table_name="stored_files")
    op.drop_index("ix_stored_files_connection_id", table_name="stored_files")
    op.drop_column("stored_files", "storage_provider")
    op.drop_column("stored_files", "connection_id")
