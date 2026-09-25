from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class TargetSegment(Base):
    __tablename__ = "target_segments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    rules: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    bot_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), index=True
    )
    bot_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_versions.id"), index=True
    )
    target_segment_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("target_segments.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(160))
    deployment_key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    mode: Mapped[str] = mapped_column(String(30), index=True)
    environment: Mapped[str] = mapped_column(String(30), default="production", index=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    rules: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CustomDomain(Base):
    __tablename__ = "custom_domains"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    deployment_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("deployments.id", ondelete="CASCADE"), index=True)
    hostname: Mapped[str] = mapped_column(String(253), unique=True, index=True)
    verification_token: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
