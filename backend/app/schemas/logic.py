from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.subflow import FactDefinition


LogicKind = Literal["rule_set", "decision_table"]


class LogicAssetCreate(BaseModel):
    kind: LogicKind
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=1000)


class LogicAssetRead(BaseModel):
    id: UUID
    kind: LogicKind
    name: str
    slug: str
    description: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LogicDraftUpdate(BaseModel):
    definition: dict[str, Any] = Field(default_factory=dict)
    input_schema: dict[str, FactDefinition] = Field(default_factory=dict)
    output_schema: dict[str, FactDefinition] = Field(default_factory=dict)


class LogicDraftRead(LogicDraftUpdate):
    id: UUID
    logic_asset_id: UUID
    version_number: int
    published: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class LogicVersionRead(BaseModel):
    id: UUID
    logic_asset_id: UUID
    version_number: int
    definition: dict[str, Any]
    input_schema: dict[str, FactDefinition]
    output_schema: dict[str, FactDefinition]
    published: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LogicPublishResponse(BaseModel):
    asset: LogicAssetRead
    version: LogicVersionRead


class LogicEvaluationRequest(BaseModel):
    facts: dict[str, Any] = Field(default_factory=dict)


class LogicEvaluationResponse(BaseModel):
    outputs: dict[str, Any]
    matched: list[str] = Field(default_factory=list)
    trace: list[dict[str, Any]] = Field(default_factory=list)


class ScenarioExpectation(BaseModel):
    """What a saved scenario asserts after it runs. Unknown keys are rejected so typos cannot silently pass."""

    model_config = {"extra": "forbid"}

    status: Literal["completed", "active", "missing_answer", "step_limit", "error"] | None = None
    terminal_node_id: str | None = None
    variables: dict[str, Any] = Field(default_factory=dict)


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    answers: dict[str, Any] = Field(default_factory=dict)
    expected: ScenarioExpectation = Field(default_factory=ScenarioExpectation)


class ScenarioRead(BaseModel):
    name: str
    answers: dict[str, Any] = Field(default_factory=dict)
    expected: dict[str, Any] = Field(default_factory=dict)
    id: UUID
    bot_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ScenarioRunRead(BaseModel):
    scenario_id: UUID
    passed: bool
    status: str
    variables: dict[str, Any]
    failures: list[str] = Field(default_factory=list)
    trace: list[dict[str, Any]] = Field(default_factory=list)


class BotAnalyticsRead(BaseModel):
    conversations: int
    completed: int
    active: int
    completion_rate: float
    drop_off_by_node: dict[str, int] = Field(default_factory=dict)
    answers_by_node: dict[str, int] = Field(default_factory=dict)
    node_metrics: dict[str, dict[str, float | int]] = Field(default_factory=dict)
