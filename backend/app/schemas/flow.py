from typing import Any, Literal

from pydantic import BaseModel, Field


class FlowDocument(BaseModel):
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)
    variables: list[dict[str, Any]] = Field(default_factory=list)
    appearance: dict[str, Any] = Field(default_factory=dict)


class ValidationIssue(BaseModel):
    severity: Literal["error", "warning", "info"]
    code: str
    message: str
    node_ids: list[str] = Field(default_factory=list)
    entity_type: Literal["bot", "node", "subflow", "rule_set", "decision"] | None = None
    entity_id: str | None = None
    path: str | None = None
    suggested_fix: str | None = None


class ValidationReport(BaseModel):
    valid: bool
    issues: list[ValidationIssue]
