"""Create the V1 foundation tables.

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "bots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("slug", sa.String(length=180), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_bots_user_id", "bots", ["user_id"])
    op.create_index("ix_bots_status", "bots", ["status"])
    op.create_index("ix_bots_slug", "bots", ["slug"], unique=True)

    op.create_table(
        "bot_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "bot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("flow_json", postgresql.JSONB(), nullable=False),
        sa.Column("published", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("bot_id", "version_number"),
    )
    op.create_index("ix_bot_versions_bot_id", "bot_versions", ["bot_id"])
    op.create_index("ix_bot_versions_published", "bot_versions", ["published"])

    op.create_table(
        "conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "bot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "bot_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bot_versions.id"),
            nullable=False,
        ),
        sa.Column("session_id", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("current_node_id", sa.String(length=160), nullable=True),
        sa.Column("variables", postgresql.JSONB(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_conversations_bot_id", "conversations", ["bot_id"])
    op.create_index("ix_conversations_bot_version_id", "conversations", ["bot_version_id"])
    op.create_index("ix_conversations_session_id", "conversations", ["session_id"], unique=True)
    op.create_index("ix_conversations_status", "conversations", ["status"])

    op.create_table(
        "conversation_answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("node_id", sa.String(length=160), nullable=False),
        sa.Column("variable_name", sa.String(length=160), nullable=False),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_conversation_answers_conversation_id",
        "conversation_answers",
        ["conversation_id"],
    )
    op.create_index(
        "ix_conversation_answers_variable_name",
        "conversation_answers",
        ["variable_name"],
    )


def downgrade() -> None:
    op.drop_table("conversation_answers")
    op.drop_table("conversations")
    op.drop_table("bot_versions")
    op.drop_table("bots")
    op.drop_table("users")
