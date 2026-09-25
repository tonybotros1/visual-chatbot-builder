from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class BotLocaleCreate(BaseModel):
    locale: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=100)
    direction: str = "ltr"
    translations: dict[str, Any] = Field(default_factory=dict)
    is_default: bool = False

    @field_validator("direction")
    @classmethod
    def valid_direction(cls, value: str) -> str:
        if value not in {"ltr", "rtl"}: raise ValueError("Direction must be ltr or rtl")
        return value


class BotLocaleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    direction: str | None = None
    translations: dict[str, Any] | None = None
    is_default: bool | None = None

    @field_validator("direction")
    @classmethod
    def valid_direction(cls, value: str | None) -> str | None:
        if value is not None and value not in {"ltr", "rtl"}: raise ValueError("Direction must be ltr or rtl")
        return value


class BotLocaleRead(BaseModel):
    id: UUID
    bot_id: UUID
    locale: str
    name: str
    direction: str
    translations: dict[str, Any]
    is_default: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
