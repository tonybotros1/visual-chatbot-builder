from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


def _clean_name(value: str) -> str:
    cleaned = " ".join(value.split())
    if len(cleaned) < 1:
        raise ValueError("Enter a workspace name")
    return cleaned


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return _clean_name(value)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    position: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_name(value)


class WorkspaceRead(BaseModel):
    id: UUID
    name: str
    description: str
    position: int
    bot_count: int
    created_at: datetime
    updated_at: datetime
    owner_name: str = ""
    # Creator and platform admins may rename or delete; everyone else only files bots into it.
    can_manage: bool = True
