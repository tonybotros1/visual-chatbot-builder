from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    bot_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), index=True
    )
    bot_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_versions.id"), index=True
    )
    session_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    current_node_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    variables: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    runtime_state: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    source: Mapped[str] = mapped_column(String(60), default="public", index=True)
    context_data: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, default=dict)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    notes: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class ConversationAnswer(Base):
    __tablename__ = "conversation_answers"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        index=True,
    )
    node_id: Mapped[str] = mapped_column(String(160))
    variable_name: Mapped[str] = mapped_column(String(160), index=True)
    value: Mapped[Any] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
