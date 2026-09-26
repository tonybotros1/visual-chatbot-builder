from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class ConversationStart(BaseModel):
    session_id: str | None = Field(default=None, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)
    locale: str | None = Field(default=None, min_length=2, max_length=20)
    deployment_token: str | None = None


class AnswerRequest(BaseModel):
    node_id: str
    value: Any = None


class RuntimeNode(BaseModel):
    id: str
    type: str
    data: dict[str, Any] = Field(default_factory=dict)


class ConversationState(BaseModel):
    conversation_id: UUID
    session_id: str
    status: str
    messages: list[RuntimeNode] = Field(default_factory=list)
    next_node: RuntimeNode | None = None
    variables: dict[str, Any] = Field(default_factory=dict)
    trace: list[dict[str, Any]] = Field(default_factory=list)
    locale: str = "en"
    direction: str = "ltr"
    appearance: dict[str, Any] = Field(default_factory=dict)
    settings: dict[str, Any] = Field(default_factory=dict)
    progress_percent: float = 0


class AnswerRead(BaseModel):
    id: UUID
    node_id: str
    variable_name: str
    value: Any
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationRead(BaseModel):
    id: UUID
    session_id: str
    status: str
    current_node_id: str | None
    variables: dict[str, Any]
    started_at: datetime
    completed_at: datetime | None
    answers: list[AnswerRead] = Field(default_factory=list)
    trace: list[dict[str, Any]] = Field(default_factory=list)
    source: str = "public"
    metadata: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    notes: list[dict[str, Any]] = Field(default_factory=list)


class ConversationUpdate(BaseModel):
    status: str | None = None
    tags: list[str] | None = None
    note: str | None = Field(default=None, max_length=4000)
