from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class BotLocale(Base):
    __tablename__ = "bot_locales"
    __table_args__ = (UniqueConstraint("bot_id", "locale"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    bot_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("bots.id", ondelete="CASCADE"), index=True)
    locale: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(100))
    direction: Mapped[str] = mapped_column(String(3), default="ltr")
    translations: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
