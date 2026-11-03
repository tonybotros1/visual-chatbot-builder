"""Short share codes for bots (used by /r/<code> links).

Revision ID: 0017_bot_share_codes
Revises: 0016_platform_settings
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0017_bot_share_codes"
down_revision = "0016_platform_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bots", sa.Column("share_code", sa.String(16), nullable=True))
    op.create_index("ix_bots_share_code", "bots", ["share_code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_bots_share_code", table_name="bots")
    op.drop_column("bots", "share_code")
