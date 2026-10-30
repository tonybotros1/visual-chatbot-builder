"""Add platform roles and account status to users.

Revision ID: 0014_platform_admin
Revises: 0013_v2b_custom_domains
Create Date: 2026-10-13
"""

from alembic import op
import sqlalchemy as sa

revision = "0014_platform_admin"
down_revision = "0013_v2b_custom_domains"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(30), nullable=False, server_default="user"))
    op.add_column("users", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_index("ix_users_role", "users", ["role"])


def downgrade() -> None:
    op.drop_index("ix_users_role", table_name="users")
    op.drop_column("users", "is_active")
    op.drop_column("users", "role")
