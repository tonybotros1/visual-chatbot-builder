from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.flow import FlowDocument, ValidationReport


FactType = Literal["string", "number", "boolean", "date", "enum"]


class FactDefinition(BaseModel):
    type: FactType = "string"
    required: bool = True
    description: str = Field(default="", max_length=500)
    values: list[str] = Field(default_factory=list)


class SubflowCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=1000)


class SubflowRead(BaseModel):
    id: UUID
    name: str
    slug: str
    description: str
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubflowDraftUpdate(BaseModel):
    flow_json: FlowDocument
    input_schema: dict[str, FactDefinition] = Field(default_factory=dict)
    output_schema: dict[str, FactDefinition] = Field(default_factory=dict)


class SubflowDraftRead(SubflowDraftUpdate):
    id: UUID
    subflow_id: UUID
    version_number: int
    published: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubflowVersionRead(BaseModel):
    id: UUID
    subflow_id: UUID
    version_number: int
    input_schema: dict[str, FactDefinition]
    output_schema: dict[str, FactDefinition]
    published: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class SubflowPublishResponse(BaseModel):
    subflow: SubflowRead
    version: SubflowVersionRead


class SubflowValidationResponse(BaseModel):
    report: ValidationReport


class DependencyRead(BaseModel):
    id: UUID
    dependency_type: str
    dependency_version_id: UUID
    node_id: str
    created_at: datetime

    model_config = {"from_attributes": True}
