from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class Subflow(Base):
    __tablename__ = "subflows"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(1000), default="")
    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SubflowVersion(Base):
    __tablename__ = "subflow_versions"
    __table_args__ = (UniqueConstraint("subflow_id", "version_number"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    subflow_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("subflows.id", ondelete="CASCADE"), index=True
    )
    version_number: Mapped[int] = mapped_column(Integer)
    flow_json: Mapped[dict[str, Any]] = mapped_column(JSONB)
    input_schema: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    output_schema: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class BotVersionDependency(Base):
    __tablename__ = "bot_version_dependencies"
    __table_args__ = (
        UniqueConstraint(
            "bot_version_id",
            "dependency_type",
            "dependency_version_id",
            "node_id",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    bot_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_versions.id", ondelete="CASCADE"), index=True
    )
    dependency_type: Mapped[str] = mapped_column(String(40), index=True)
    dependency_version_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    node_id: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
