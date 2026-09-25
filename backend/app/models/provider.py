from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class StoredFile(Base):
    __tablename__ = "stored_files"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(160), index=True)
    connection_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("integration_connections.id", ondelete="SET NULL"), nullable=True, index=True)
    storage_provider: Mapped[str] = mapped_column(String(40), default="local", index=True)
    original_name: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(200))
    size: Mapped[int] = mapped_column(BigInteger)
    storage_key: Mapped[str] = mapped_column(String(500), unique=True)
    scan_status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(160), index=True)
    connection_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("integration_connections.id", ondelete="SET NULL"), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(40), index=True)
    provider_reference: Mapped[str] = mapped_column(String(240), unique=True, index=True)
    amount_minor: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AppointmentReservation(Base):
    __tablename__ = "appointment_reservations"
    __table_args__ = (UniqueConstraint("provider", "calendar_reference", "starts_at"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(160), index=True)
    connection_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("integration_connections.id", ondelete="SET NULL"), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(50), index=True)
    calendar_reference: Mapped[str] = mapped_column(String(240), default="local")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    timezone: Mapped[str] = mapped_column(String(80), default="UTC")
    status: Mapped[str] = mapped_column(String(30), default="confirmed", index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(160), index=True)
    connection_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("integration_connections.id", ondelete="CASCADE"), index=True)
    phone: Mapped[str] = mapped_column(String(80))
    code_hash: Mapped[str] = mapped_column(String(128))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
