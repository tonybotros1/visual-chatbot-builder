from copy import deepcopy
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.routes.bots import owned_bot
from app.database.session import get_db
from app.engine.dependencies import validate_subflow_dependencies
from app.engine.validator import validate_flow, validate_flow_connections
from app.models.bot import Bot, BotVersion
from app.models.subflow import BotVersionDependency
from app.models.user import User
from app.schemas.bot import PublishResponse, VersionRead
from app.schemas.flow import FlowDocument, ValidationReport
from app.schemas.subflow import DependencyRead


router = APIRouter()


def _get_draft(bot_id: UUID, user: User, db: Session) -> BotVersion:
    owned_bot(bot_id, user, db)
    draft = db.scalar(
        select(BotVersion).where(
            BotVersion.bot_id == bot_id,
            BotVersion.version_number == 0,
            BotVersion.published.is_(False),
        )
    )
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")
    return draft


@router.get("/{bot_id}/flow", response_model=FlowDocument)
def read_flow(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> FlowDocument:
    draft = _get_draft(bot_id, user, db)
    return FlowDocument.model_validate(draft.flow_json)


@router.put("/{bot_id}/flow", response_model=FlowDocument)
def save_flow(
    bot_id: UUID,
    document: FlowDocument,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> FlowDocument:
    owned_bot(bot_id, user, db, "editor")
    draft = _get_draft(bot_id, user, db)
    draft.flow_json = document.model_dump(mode="json")
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return FlowDocument.model_validate(draft.flow_json)


@router.post("/{bot_id}/validate", response_model=ValidationReport)
def validate_bot_flow(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ValidationReport:
    owned_bot(bot_id, user, db)
    draft = _get_draft(bot_id, user, db)
    return validate_flow_connections(draft.flow_json)


@router.get("/{bot_id}/versions", response_model=list[VersionRead])
def list_versions(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[BotVersion]:
    owned_bot(bot_id, user, db)
    return list(
        db.scalars(
            select(BotVersion)
            .where(BotVersion.bot_id == bot_id, BotVersion.published.is_(True))
            .order_by(BotVersion.version_number.desc())
        )
    )


@router.get(
    "/{bot_id}/versions/{version_number}/dependencies",
    response_model=list[DependencyRead],
)
def list_version_dependencies(
    bot_id: UUID,
    version_number: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[BotVersionDependency]:
    owned_bot(bot_id, user, db)
    version = db.scalar(
        select(BotVersion).where(
            BotVersion.bot_id == bot_id,
            BotVersion.version_number == version_number,
            BotVersion.published.is_(True),
        )
    )
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot version not found")
    return list(
        db.scalars(
            select(BotVersionDependency)
            .where(BotVersionDependency.bot_version_id == version.id)
            .order_by(BotVersionDependency.created_at)
        )
    )


@router.post("/{bot_id}/publish", response_model=PublishResponse)
def publish_flow(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PublishResponse:
    bot = owned_bot(bot_id, user, db, "editor")
    draft = _get_draft(bot_id, user, db)
    report = validate_flow(draft.flow_json)
    report = validate_subflow_dependencies(db, bot.user_id, draft.flow_json, report)
    if not report.valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[issue.model_dump() for issue in report.issues],
        )
    latest = db.scalar(
        select(func.max(BotVersion.version_number)).where(BotVersion.bot_id == bot_id)
    ) or 0
    version = BotVersion(
        bot_id=bot_id,
        version_number=latest + 1,
        flow_json=deepcopy(draft.flow_json),
        published=True,
    )
    bot.status = "published"
    db.add_all([version, bot])
    db.flush()
    dependencies = []
    for node in draft.flow_json.get("nodes", []):
        if node.get("type") == "subflow":
            dependencies.append(
                BotVersionDependency(
                    bot_version_id=version.id,
                    dependency_type="subflow",
                    dependency_version_id=UUID(node["data"]["subflow_version_id"]),
                    node_id=str(node["id"]),
                )
            )
        if node.get("type") in {"ruleSet", "decisionTable"}:
            dependencies.append(
                BotVersionDependency(
                    bot_version_id=version.id,
                    dependency_type="rule_set" if node.get("type") == "ruleSet" else "decision_table",
                    dependency_version_id=UUID(node["data"]["logic_version_id"]),
                    node_id=str(node["id"]),
                )
            )
    db.add_all(dependencies)
    db.commit()
    db.refresh(version)
    db.refresh(bot)
    return PublishResponse(
        bot=bot,
        version=version,
        public_url=f"/chat/{bot.slug}",
    )
