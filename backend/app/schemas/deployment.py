from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class TargetingCondition(BaseModel):
    model_config = {"extra": "forbid"}

    field: str = Field(min_length=1, max_length=80)
    operator: str = Field(default="equals", max_length=20)
    value: Any = None


class TargetingGroup(BaseModel):
    model_config = {"extra": "forbid"}

    combinator: Literal["all", "any"] = "all"
    conditions: list[TargetingCondition] = Field(default_factory=list)
    groups: list["TargetingGroup"] = Field(default_factory=list)
    not_: bool | None = Field(default=None, alias="not")


class TargetingSchedule(BaseModel):
    model_config = {"extra": "forbid"}

    starts_at: str | None = None
    ends_at: str | None = None


class TargetingFrequency(BaseModel):
    model_config = {"extra": "forbid"}

    max_impressions: int | None = Field(default=None, ge=1)
    once_per_session: bool | None = None


class TargetingRules(BaseModel):
    """Audience rules as evaluate_targeting reads them; unknown keys are rejected so a typo cannot silently match everyone."""

    model_config = {"extra": "forbid", "populate_by_name": True}

    schedule: TargetingSchedule | None = None
    frequency: TargetingFrequency | None = None
    match: TargetingGroup | None = None


def rules_dict(rules: "TargetingRules | None") -> dict[str, Any]:
    return rules.model_dump(exclude_none=True, by_alias=True) if rules else {}


class TargetSegmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    rules: TargetingRules = Field(default_factory=TargetingRules)


class TargetSegmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    rules: TargetingRules | None = None
    status: Literal["active", "archived"] | None = None


class TargetSegmentRead(BaseModel):
    id: UUID
    name: str
    slug: str
    rules: dict[str, Any]
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeploymentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    mode: Literal["widget", "embed", "link"] = "widget"
    environment: Literal["development", "staging", "production"] = "production"
    target_segment_id: UUID | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    rules: TargetingRules = Field(default_factory=TargetingRules)


class DeploymentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    mode: Literal["widget", "embed", "link"] | None = None
    environment: Literal["development", "staging", "production"] | None = None
    target_segment_id: UUID | None = None
    config: dict[str, Any] | None = None
    rules: dict[str, Any] | None = None
    status: Literal["active", "paused", "archived"] | None = None


class DeploymentRead(BaseModel):
    id: UUID
    bot_id: UUID
    bot_version_id: UUID
    target_segment_id: UUID | None
    name: str
    deployment_key: str
    mode: str
    environment: str
    config: dict[str, Any]
    rules: dict[str, Any]
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DeploymentEvaluation(BaseModel):
    eligible: bool
    reasons: list[str] = Field(default_factory=list)


class DeploymentBootstrap(BaseModel):
    eligible: bool
    reasons: list[str] = Field(default_factory=list)
    deployment_key: str
    mode: str
    config: dict[str, Any] = Field(default_factory=dict)
    bot_slug: str | None = None
    version_number: int | None = None
    start_endpoint: str | None = None
    eligibility_token: str | None = None


class CustomDomainCreate(BaseModel):
    hostname: str = Field(min_length=4, max_length=253)


class CustomDomainRead(BaseModel):
    id: UUID
    deployment_id: UUID
    hostname: str
    verification_token: str
    status: str
    verified_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
