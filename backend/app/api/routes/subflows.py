import re
from copy import deepcopy
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.database.session import get_db
from app.engine.dependencies import validate_subflow_dependencies
from app.engine.validator import validate_flow
from app.models.subflow import Subflow, SubflowVersion
from app.models.user import User
from app.schemas.flow import ValidationReport
from app.schemas.subflow import (
    SubflowCreate,
    SubflowDraftRead,
    SubflowDraftUpdate,
    SubflowPublishResponse,
    SubflowRead,
    SubflowVersionRead,
)


router = APIRouter()


STARTER_SUBFLOW = {
    "nodes": [
        {
            "id": "start",
            "type": "start",
            "position": {"x": 80, "y": 180},
            "data": {"label": "Start"},
        },
        {
            "id": "message",
            "type": "message",
            "position": {"x": 370, "y": 170},
            "data": {"label": "Reusable step", "description": "Edit this component."},
        },
        {
            "id": "return",
            "type": "return",
            "position": {"x": 680, "y": 180},
            "data": {"label": "Return to parent"},
        },
    ],
    "edges": [
        {"id": "start-message", "source": "start", "target": "message"},
        {"id": "message-return", "source": "message", "target": "return"},
    ],
    "variables": [],
}


def owned_subflow(subflow_id: UUID, user: User, db: Session) -> Subflow:
    subflow = db.scalar(
        select(Subflow).where(Subflow.id == subflow_id, Subflow.user_id == user.id)
    )
    if subflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subflow not found")
    return subflow


def _draft(subflow_id: UUID, user: User, db: Session) -> SubflowVersion:
    owned_subflow(subflow_id, user, db)
    draft = db.scalar(
        select(SubflowVersion).where(
            SubflowVersion.subflow_id == subflow_id,
            SubflowVersion.version_number == 0,
            SubflowVersion.published.is_(False),
        )
    )
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subflow draft not found")
    return draft


def _unique_slug(name: str, db: Session) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "component"
    slug = base
    counter = 2
    while db.scalar(select(Subflow.id).where(Subflow.slug == slug)):
        slug = f"{base}-{counter}"
        counter += 1
    return slug


@router.get("", response_model=list[SubflowRead])
def list_subflows(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Subflow]:
    return list(
        db.scalars(
            select(Subflow)
            .where(Subflow.user_id == user.id, Subflow.status != "archived")
            .order_by(Subflow.updated_at.desc())
        )
    )


@router.post("", response_model=SubflowRead, status_code=status.HTTP_201_CREATED)
def create_subflow(
    payload: SubflowCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Subflow:
    subflow = Subflow(
        user_id=user.id,
        name=payload.name.strip(),
        slug=_unique_slug(payload.name, db),
        description=payload.description,
        status="draft",
    )
    db.add(subflow)
    db.flush()
    db.add(
        SubflowVersion(
            subflow_id=subflow.id,
            version_number=0,
            flow_json=STARTER_SUBFLOW,
            input_schema={},
            output_schema={},
            published=False,
        )
    )
    db.commit()
    db.refresh(subflow)
    return subflow


@router.get("/{subflow_id}", response_model=SubflowRead)
def get_subflow(
    subflow_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Subflow:
    return owned_subflow(subflow_id, user, db)


@router.get("/{subflow_id}/draft", response_model=SubflowDraftRead)
def read_draft(
    subflow_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SubflowVersion:
    return _draft(subflow_id, user, db)


@router.put("/{subflow_id}/draft", response_model=SubflowDraftRead)
def save_draft(
    subflow_id: UUID,
    payload: SubflowDraftUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SubflowVersion:
    draft = _draft(subflow_id, user, db)
    draft.flow_json = payload.flow_json.model_dump(mode="json")
    draft.input_schema = {
        name: definition.model_dump(mode="json")
        for name, definition in payload.input_schema.items()
    }
    draft.output_schema = {
        name: definition.model_dump(mode="json")
        for name, definition in payload.output_schema.items()
    }
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft


@router.post("/{subflow_id}/validate", response_model=ValidationReport)
def validate_subflow(
    subflow_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ValidationReport:
    draft = _draft(subflow_id, user, db)
    report = validate_flow(
        draft.flow_json,
        terminal_types={"return"},
        external_variables=set((draft.input_schema or {}).keys()),
        required_outputs={
            name
            for name, definition in (draft.output_schema or {}).items()
            if definition.get("required", True)
        },
    )
    return validate_subflow_dependencies(db, user.id, draft.flow_json, report)


@router.post("/{subflow_id}/publish", response_model=SubflowPublishResponse)
def publish_subflow(
    subflow_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SubflowPublishResponse:
    subflow = owned_subflow(subflow_id, user, db)
    draft = _draft(subflow_id, user, db)
    report = validate_flow(
        draft.flow_json,
        terminal_types={"return"},
        external_variables=set((draft.input_schema or {}).keys()),
        required_outputs={
            name
            for name, definition in (draft.output_schema or {}).items()
            if definition.get("required", True)
        },
    )
    report = validate_subflow_dependencies(db, user.id, draft.flow_json, report)
    if not report.valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[issue.model_dump() for issue in report.issues],
        )
    latest = db.scalar(
        select(func.max(SubflowVersion.version_number)).where(
            SubflowVersion.subflow_id == subflow_id
        )
    ) or 0
    version = SubflowVersion(
        subflow_id=subflow_id,
        version_number=latest + 1,
        flow_json=deepcopy(draft.flow_json),
        input_schema=deepcopy(draft.input_schema or {}),
        output_schema=deepcopy(draft.output_schema or {}),
        published=True,
    )
    subflow.status = "published"
    db.add_all([version, subflow])
    db.commit()
    db.refresh(version)
    db.refresh(subflow)
    return SubflowPublishResponse(subflow=subflow, version=version)


@router.get("/{subflow_id}/versions", response_model=list[SubflowVersionRead])
def list_versions(
    subflow_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[SubflowVersion]:
    owned_subflow(subflow_id, user, db)
    return list(
        db.scalars(
            select(SubflowVersion)
            .where(
                SubflowVersion.subflow_id == subflow_id,
                SubflowVersion.published.is_(True),
            )
            .order_by(SubflowVersion.version_number.desc())
        )
    )
