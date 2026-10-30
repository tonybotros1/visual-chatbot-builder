from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class AdminOverview(BaseModel):
    users_total: int
    users_active: int
    bots_total: int
    bots_published: int
    bots_archived: int
    conversations_total: int
    conversations_last_7_days: int
    conversations_completed: int
    deployments_active: int
    deliveries_pending: int
    deliveries_failed: int
    subflows_total: int
    logic_assets_total: int


class AdminUserRead(BaseModel):
    id: UUID
    name: str
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime
    bot_count: int = 0


class AdminUserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="user", pattern="^(user|superadmin)$")


class AdminUserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    role: str | None = Field(default=None, pattern="^(user|superadmin)$")
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminBotRead(BaseModel):
    id: UUID
    name: str
    slug: str
    status: str
    owner_id: UUID
    owner_email: str
    owner_name: str
    created_at: datetime
    updated_at: datetime
    conversation_count: int = 0
    deployment_count: int = 0
    published_version: int | None = None


class AdminBotUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(draft|published|archived)$")
    owner_id: UUID | None = None


class AdminAuditRead(BaseModel):
    id: UUID
    created_at: datetime
    action: str
    entity_type: str
    entity_id: str
    details: dict[str, Any]
    bot_id: UUID
    bot_name: str | None = None
    user_id: UUID | None = None
    user_email: str | None = None


class AdminDeliveryRead(BaseModel):
    id: UUID
    created_at: datetime
    bot_id: UUID
    bot_name: str | None = None
    event: str
    status: str
    attempt_count: int
    next_attempt_at: datetime | None = None
    last_error: str
    connection_name: str | None = None
    provider: str | None = None
