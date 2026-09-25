from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.routes.bots import owned_bot
from app.database.session import get_db
from app.models.bot import Bot
from app.models.team import AuditLog, BotCollaborator
from app.models.user import User
from app.schemas.team import AuditLogRead, CollaboratorInvite, CollaboratorRead, CollaboratorUpdate
from app.services.audit import record_audit


router = APIRouter()


@router.get("/{bot_id}/collaborators", response_model=list[CollaboratorRead])
def list_collaborators(bot_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> list[CollaboratorRead]:
    bot = owned_bot(bot_id, user, db)
    owner = db.get(User, bot.user_id)
    result = [CollaboratorRead(id=None, user_id=owner.id, name=owner.name, email=owner.email, role="owner", owner=True)] if owner else []
    rows = db.execute(select(BotCollaborator, User).join(User, User.id == BotCollaborator.user_id).where(BotCollaborator.bot_id == bot_id).order_by(User.name)).all()
    result.extend(CollaboratorRead(id=item.id, user_id=member.id, name=member.name, email=member.email, role=item.role, created_at=item.created_at) for item, member in rows)
    return result


@router.post("/{bot_id}/collaborators", response_model=CollaboratorRead, status_code=201)
def invite_collaborator(bot_id: UUID, payload: CollaboratorInvite, actor: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> CollaboratorRead:
    bot = owned_bot(bot_id, actor, db, "admin")
    member = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if member is None: raise HTTPException(status_code=404, detail="That email must register before it can be added")
    if member.id == bot.user_id: raise HTTPException(status_code=409, detail="The bot owner already has full access")
    item = db.scalar(select(BotCollaborator).where(BotCollaborator.bot_id == bot_id, BotCollaborator.user_id == member.id))
    if item is None: item = BotCollaborator(bot_id=bot_id, user_id=member.id, role=payload.role); db.add(item)
    else: item.role = payload.role
    record_audit(db, bot_id, actor.id, "collaborator.upserted", "user", str(member.id), {"role": payload.role})
    db.commit(); db.refresh(item)
    return CollaboratorRead(id=item.id, user_id=member.id, name=member.name, email=member.email, role=item.role, created_at=item.created_at)


@router.put("/{bot_id}/collaborators/{collaborator_id}", response_model=CollaboratorRead)
def update_collaborator(bot_id: UUID, collaborator_id: UUID, payload: CollaboratorUpdate, actor: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> CollaboratorRead:
    owned_bot(bot_id, actor, db, "admin")
    item = db.scalar(select(BotCollaborator).where(BotCollaborator.id == collaborator_id, BotCollaborator.bot_id == bot_id))
    if item is None: raise HTTPException(status_code=404, detail="Collaborator not found")
    member = db.get(User, item.user_id); item.role = payload.role
    record_audit(db, bot_id, actor.id, "collaborator.role_changed", "user", str(item.user_id), {"role": payload.role})
    db.commit(); db.refresh(item)
    return CollaboratorRead(id=item.id, user_id=member.id, name=member.name, email=member.email, role=item.role, created_at=item.created_at)


@router.delete("/{bot_id}/collaborators/{collaborator_id}", status_code=204)
def remove_collaborator(bot_id: UUID, collaborator_id: UUID, actor: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> None:
    owned_bot(bot_id, actor, db, "admin")
    item = db.scalar(select(BotCollaborator).where(BotCollaborator.id == collaborator_id, BotCollaborator.bot_id == bot_id))
    if item is None: raise HTTPException(status_code=404, detail="Collaborator not found")
    record_audit(db, bot_id, actor.id, "collaborator.removed", "user", str(item.user_id), {"role": item.role})
    db.delete(item); db.commit()


@router.get("/{bot_id}/audit-log", response_model=list[AuditLogRead])
def audit_log(bot_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> list[AuditLog]:
    owned_bot(bot_id, user, db, "admin")
    return list(db.scalars(select(AuditLog).where(AuditLog.bot_id == bot_id).order_by(AuditLog.created_at.desc()).limit(500)))
