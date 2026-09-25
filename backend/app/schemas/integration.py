from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


IntegrationKind = Literal["webhook", "email", "sms", "slack", "storage", "stripe", "paypal", "google_calendar", "microsoft_calendar"]


class IntegrationCreate(BaseModel):
    kind: IntegrationKind
    name: str = Field(min_length=2, max_length=160)
    config: dict[str, Any] = Field(default_factory=dict)
    secrets: dict[str, str] = Field(default_factory=dict)


class IntegrationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    config: dict[str, Any] | None = None
    secrets: dict[str, str] | None = None
    status: Literal["active", "disabled"] | None = None


class IntegrationRead(BaseModel):
    id: UUID
    kind: str
    name: str
    config: dict[str, Any]
    has_secrets: bool
    status: str
    created_at: datetime
    updated_at: datetime


class SubscriptionCreate(BaseModel):
    connection_id: UUID
    event: Literal["conversation.started", "conversation.completed", "response.qualified"] = "conversation.completed"


class SubscriptionRead(BaseModel):
    id: UUID
    bot_id: UUID
    connection_id: UUID
    event: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DeliveryRead(BaseModel):
    id: UUID
    bot_id: UUID
    conversation_id: UUID | None
    connection_id: UUID
    event: str
    status: str
    attempt_count: int
    next_attempt_at: datetime | None
    last_error: str
    response_code: int | None
    created_at: datetime
    delivered_at: datetime | None

    model_config = {"from_attributes": True}
