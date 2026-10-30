from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BotCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=1000)


class BotUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    status: str | None = None
    # Public link slug; letters, digits and dashes. Renaming a bot no longer changes it.
    slug: str | None = Field(default=None, min_length=2, max_length=160)


class BotRead(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VersionRead(BaseModel):
    id: UUID
    version_number: int
    published: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class PublishResponse(BaseModel):
    bot: BotRead
    version: VersionRead
    public_url: str

