"""Add bot locales and translation catalogs.

Revision ID: 0009_v2b_localization
Revises: 0008_v2b_teams
Create Date: 2026-09-19
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009_v2b_localization"
down_revision = "0008_v2b_teams"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("bot_locales",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("bot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bots.id", ondelete="CASCADE"), nullable=False),
        sa.Column("locale", sa.String(20), nullable=False), sa.Column("name", sa.String(100), nullable=False), sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("translations", postgresql.JSONB(), nullable=False), sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("bot_id", "locale"))
    for column in ("bot_id", "locale", "is_default"): op.create_index(f"ix_bot_locales_{column}", "bot_locales", [column])


def downgrade() -> None:
    op.drop_table("bot_locales")
