from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.routes.platform import bot_sharing_mode
from app.database.session import get_db
from app.models.bot import Bot
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.workspace import WorkspaceCreate, WorkspaceRead, WorkspaceUpdate


router = APIRouter()


def workspaces_are_shared(user: User, db: Session) -> bool:
    """Under the "view"/"edit" sharing rule every account sees the same workspaces; platform admins always do."""
    return user.role == "superadmin" or bot_sharing_mode(db) in {"view", "edit"}


def can_manage_workspace(workspace_owner_id: UUID, user: User) -> bool:
    return workspace_owner_id == user.id or user.role == "superadmin"


def visible_workspace(workspace_id: UUID, user: User, db: Session) -> Workspace:
    """A workspace the caller may file bots into (theirs, or any when shared)."""
    workspace = db.get(Workspace, workspace_id)
    if workspace is None or (workspace.user_id != user.id and not workspaces_are_shared(user, db)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


def owned_workspace(workspace_id: UUID, user: User, db: Session) -> Workspace:
    """A workspace the caller may rename or delete."""
    workspace = visible_workspace(workspace_id, user, db)
    if not can_manage_workspace(workspace.user_id, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the workspace's creator or a platform admin can change it")
    return workspace


def _bot_counts(db: Session) -> dict[UUID, int]:
    rows = db.execute(
        select(Bot.workspace_id, func.count(Bot.id)).where(Bot.workspace_id.is_not(None), Bot.status != "archived").group_by(Bot.workspace_id)
    ).all()
    return {workspace_id: count for workspace_id, count in rows}


def _read(workspace: Workspace, owner: User | None, user: User, bot_count: int) -> WorkspaceRead:
    return WorkspaceRead(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        position=workspace.position,
        bot_count=bot_count,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
        owner_name=owner.name if owner else "",
        can_manage=can_manage_workspace(workspace.user_id, user),
    )


def _ensure_name_free(name: str, user: User, db: Session, *, workspace_id: UUID | None = None) -> None:
    statement = select(Workspace.id).where(func.lower(Workspace.name) == name.lower(), Workspace.id != workspace_id)
    if not workspaces_are_shared(user, db):
        statement = statement.where(Workspace.user_id == user.id)
    if db.scalar(statement):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A workspace with this name already exists")


@router.get("", response_model=list[WorkspaceRead])
def list_workspaces(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[WorkspaceRead]:
    counts = _bot_counts(db)
    statement = select(Workspace, User).join(User, User.id == Workspace.user_id)
    if not workspaces_are_shared(user, db):
        statement = statement.where(Workspace.user_id == user.id)
    rows = db.execute(statement.order_by(Workspace.position, Workspace.created_at)).all()
    return [_read(workspace, owner, user, counts.get(workspace.id, 0)) for workspace, owner in rows]


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> WorkspaceRead:
    _ensure_name_free(payload.name, user, db)
    last = db.scalar(select(func.max(Workspace.position)))
    workspace = Workspace(user_id=user.id, name=payload.name, description=payload.description, position=(last or 0) + 1)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return _read(workspace, user, user, 0)


@router.put("/{workspace_id}", response_model=WorkspaceRead)
def update_workspace(
    workspace_id: UUID,
    payload: WorkspaceUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> WorkspaceRead:
    workspace = owned_workspace(workspace_id, user, db)
    if payload.name is not None:
        _ensure_name_free(payload.name, user, db, workspace_id=workspace.id)
        workspace.name = payload.name
    if payload.description is not None:
        workspace.description = payload.description
    if payload.position is not None:
        workspace.position = payload.position
    db.commit()
    db.refresh(workspace)
    return _read(workspace, db.get(User, workspace.user_id), user, _bot_counts(db).get(workspace.id, 0))


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Remove the folder only. Its bots stay and show up unsorted (the FK sets workspace_id to NULL)."""
    workspace = owned_workspace(workspace_id, user, db)
    db.delete(workspace)
    db.commit()
