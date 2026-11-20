from typing import Annotated, Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.models.user import User
from app.services.bot_script import compile_script, export_script
from app.services.bot_script_rules import EXAMPLE, RULES

# The Code tab of the builder: read a Bot Script into a flow, and write a flow back as a script.
# Nothing here touches a bot; the builder decides what to do with the result.
router = APIRouter()


class ScriptCheckRequest(BaseModel):
    code: str = Field(default="", max_length=400_000)


class ScriptIssue(BaseModel):
    severity: str
    message: str
    line: int | None = None
    step: str | None = None


class ScriptCheckResponse(BaseModel):
    ok: bool
    issues: list[ScriptIssue]
    languages: list[str]
    name: str = ""
    steps: int = 0
    nodes: int = 0
    questions: int = 0
    flow: dict[str, Any] | None = None


class ScriptExportRequest(BaseModel):
    flow: dict[str, Any]
    name: str = ""


class ScriptExportResponse(BaseModel):
    code: str
    warnings: list[str]
    languages: list[str]


class ScriptRulesResponse(BaseModel):
    rules: str
    example: str


@router.get("/rules", response_model=ScriptRulesResponse)
def script_rules(_: Annotated[User, Depends(get_current_user)]) -> ScriptRulesResponse:
    return ScriptRulesResponse(rules=RULES, example=EXAMPLE)


@router.post("/check", response_model=ScriptCheckResponse)
def check_script(payload: ScriptCheckRequest, _: Annotated[User, Depends(get_current_user)]) -> ScriptCheckResponse:
    return ScriptCheckResponse(**compile_script(payload.code))


@router.post("/export", response_model=ScriptExportResponse)
def flow_as_script(payload: ScriptExportRequest, _: Annotated[User, Depends(get_current_user)]) -> ScriptExportResponse:
    return ScriptExportResponse(**export_script(payload.flow, payload.name))
