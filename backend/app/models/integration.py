from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class IntegrationConnection(Base):
    __tablename__ = "integration_connections"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(50), index=True)
    name: Mapped[str] = mapped_column(String(160))
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    encrypted_secrets: Mapped[bytes] = mapped_column(LargeBinary, default=b"")
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class BotEventSubscription(Base):
    __tablename__ = "bot_event_subscriptions"
    __table_args__ = (UniqueConstraint("bot_id", "connection_id", "event"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    bot_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    connection_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("integration_connections.id", ondelete="CASCADE"), index=True)
    event: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IntegrationDelivery(Base):
    __tablename__ = "integration_deliveries"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    bot_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    conversation_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, index=True)
    connection_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("integration_connections.id", ondelete="CASCADE"), index=True)
    event: Mapped[str] = mapped_column(String(80), index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_error: Mapped[str] = mapped_column(Text, default="")
    response_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

