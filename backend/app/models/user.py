from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.config import get_settings
from app.database.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # "user" for builders; "superadmin" unlocks the platform admin console.
    role: Mapped[str] = mapped_column(String(30), default="user", server_default="user", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    @property
    def is_owner(self) -> bool:
        """The account named by SUPER_ADMIN_EMAIL: seeded as super admin on every start and protected from
        role, access and deletion changes by other admins."""
        email = get_settings().super_admin_email.strip().lower()
        return bool(email) and self.email.lower() == email
