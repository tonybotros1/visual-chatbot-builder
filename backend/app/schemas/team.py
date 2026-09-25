from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr


class CollaboratorInvite(BaseModel):
    email: EmailStr
    role: Literal["viewer", "editor", "admin"] = "viewer"


class CollaboratorUpdate(BaseModel):
    role: Literal["viewer", "editor", "admin"]


class CollaboratorRead(BaseModel):
    id: UUID | None
    user_id: UUID
    name: str
    email: EmailStr
    role: str
    owner: bool = False
    created_at: datetime | None = None


class AuditLogRead(BaseModel):
    id: UUID
    bot_id: UUID
    user_id: UUID | None
    action: str
    entity_type: str
    entity_id: str
    details: dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}
