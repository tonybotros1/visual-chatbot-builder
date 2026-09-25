import re
from copy import deepcopy
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.database.session import get_db
from app.engine.logic import LoadedLogic, evaluate_logic, validate_logic_definition
from app.models.logic import LogicAsset, LogicAssetVersion
from app.models.user import User
from app.schemas.flow import ValidationReport
from app.schemas.logic import (
    LogicAssetCreate,
    LogicAssetRead,
    LogicDraftRead,
    LogicDraftUpdate,
    LogicEvaluationRequest,
    LogicEvaluationResponse,
    LogicPublishResponse,
    LogicVersionRead,
)


router = APIRouter()


STARTERS = {
    "rule_set": {
        "strategy": "FIRST",
        "rules": [
            {
                "id": "rule-1",
                "name": "Example rule",
                "when": [{"fact": "input", "operator": "==", "value": "yes"}],
                "outputs": {"result": "approved"},
            }
        ],
        "default_outputs": {"result": "declined"},
    },
    "decision_table": {
        "hit_policy": "FIRST",
        "rows": [
            {
                "id": "row-1",
                "conditions": {"input": {"operator": "==", "value": "yes"}},
                "outputs": {"result": "approved"},
            }
        ],
        "default_outputs": {"result": "declined"},
    },
}

STARTER_INPUT = {
    "input": {"type": "string", "required": True, "description": "Example input", "values": []}
}
STARTER_OUTPUT = {
    "result": {"type": "string", "required": True, "description": "Decision result", "values": []}
}


def owned_logic_asset(asset_id: UUID, user: User, db: Session) -> LogicAsset:
    asset = db.scalar(
        select(LogicAsset).where(LogicAsset.id == asset_id, LogicAsset.user_id == user.id)
    )
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logic asset not found")
    return asset


def _draft(asset_id: UUID, user: User, db: Session) -> LogicAssetVersion:
    owned_logic_asset(asset_id, user, db)
    draft = db.scalar(
        select(LogicAssetVersion).where(
            LogicAssetVersion.logic_asset_id == asset_id,
            LogicAssetVersion.version_number == 0,
            LogicAssetVersion.published.is_(False),
        )
    )
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logic draft not found")
    return draft


def _unique_slug(name: str, db: Session) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "logic"
    slug = base
    counter = 2
    while db.scalar(select(LogicAsset.id).where(LogicAsset.slug == slug)):
        slug = f"{base}-{counter}"
        counter += 1
    return slug


@router.get("", response_model=list[LogicAssetRead])
def list_logic_assets(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    kind: str | None = None,
) -> list[LogicAsset]:
    query = select(LogicAsset).where(
        LogicAsset.user_id == user.id,
        LogicAsset.status != "archived",
    )
    if kind:
        query = query.where(LogicAsset.kind == kind)
    return list(db.scalars(query.order_by(LogicAsset.updated_at.desc())))


@router.post("", response_model=LogicAssetRead, status_code=status.HTTP_201_CREATED)
def create_logic_asset(
    payload: LogicAssetCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LogicAsset:
    asset = LogicAsset(
        user_id=user.id,
        kind=payload.kind,
        name=payload.name.strip(),
        slug=_unique_slug(payload.name, db),
        description=payload.description,
        status="draft",
    )
    db.add(asset)
    db.flush()
    db.add(
        LogicAssetVersion(
            logic_asset_id=asset.id,
            version_number=0,
            definition=deepcopy(STARTERS[payload.kind]),
            input_schema=deepcopy(STARTER_INPUT),
            output_schema=deepcopy(STARTER_OUTPUT),
            published=False,
        )
    )
    db.commit()
    db.refresh(asset)
    return asset


@router.get("/{asset_id}", response_model=LogicAssetRead)
def get_logic_asset(
    asset_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LogicAsset:
    return owned_logic_asset(asset_id, user, db)


@router.get("/{asset_id}/draft", response_model=LogicDraftRead)
def read_logic_draft(
    asset_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LogicAssetVersion:
    return _draft(asset_id, user, db)


@router.put("/{asset_id}/draft", response_model=LogicDraftRead)
def save_logic_draft(
    asset_id: UUID,
    payload: LogicDraftUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LogicAssetVersion:
    draft = _draft(asset_id, user, db)
    draft.definition = payload.definition
    draft.input_schema = {name: item.model_dump(mode="json") for name, item in payload.input_schema.items()}
    draft.output_schema = {name: item.model_dump(mode="json") for name, item in payload.output_schema.items()}
    db.commit()
    db.refresh(draft)
    return draft


@router.post("/{asset_id}/validate", response_model=ValidationReport)
def validate_logic_asset(
    asset_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ValidationReport:
    asset = owned_logic_asset(asset_id, user, db)
    draft = _draft(asset_id, user, db)
    return validate_logic_definition(
        asset.kind,
        draft.definition,
        draft.input_schema or {},
        draft.output_schema or {},
    )


@router.post("/{asset_id}/evaluate", response_model=LogicEvaluationResponse)
def evaluate_logic_asset(
    asset_id: UUID,
    payload: LogicEvaluationRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LogicEvaluationResponse:
    asset = owned_logic_asset(asset_id, user, db)
    draft = _draft(asset_id, user, db)
    evaluation = evaluate_logic(
        LoadedLogic(
            kind=asset.kind,
            version_id=str(draft.id),
            definition=draft.definition,
            input_schema=draft.input_schema or {},
            output_schema=draft.output_schema or {},
            published=False,
        ),
        payload.facts,
    )
    return LogicEvaluationResponse(
        outputs=evaluation.outputs,
        matched=evaluation.matched,
        trace=evaluation.trace,
    )


@router.post("/{asset_id}/publish", response_model=LogicPublishResponse)
def publish_logic_asset(
    asset_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> LogicPublishResponse:
    asset = owned_logic_asset(asset_id, user, db)
    draft = _draft(asset_id, user, db)
    report = validate_logic_definition(
        asset.kind,
        draft.definition,
        draft.input_schema or {},
        draft.output_schema or {},
    )
    if not report.valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[issue.model_dump() for issue in report.issues],
        )
    latest = db.scalar(
        select(func.max(LogicAssetVersion.version_number)).where(
            LogicAssetVersion.logic_asset_id == asset_id
        )
    ) or 0
    version = LogicAssetVersion(
        logic_asset_id=asset.id,
        version_number=latest + 1,
        definition=deepcopy(draft.definition),
        input_schema=deepcopy(draft.input_schema or {}),
        output_schema=deepcopy(draft.output_schema or {}),
        published=True,
    )
    asset.status = "published"
    db.add_all([version, asset])
    db.commit()
    db.refresh(version)
    db.refresh(asset)
    return LogicPublishResponse(asset=asset, version=version)


@router.get("/{asset_id}/versions", response_model=list[LogicVersionRead])
def list_logic_versions(
    asset_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[LogicAssetVersion]:
    owned_logic_asset(asset_id, user, db)
    return list(
        db.scalars(
            select(LogicAssetVersion)
            .where(
                LogicAssetVersion.logic_asset_id == asset_id,
                LogicAssetVersion.published.is_(True),
            )
            .order_by(LogicAssetVersion.version_number.desc())
        )
    )
