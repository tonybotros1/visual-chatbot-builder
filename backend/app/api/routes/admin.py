"""Platform administration endpoints. Every route requires the superadmin role."""

from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.dependencies import get_super_admin
from app.database.session import get_db
from app.models.bot import Bot, BotVersion
from app.models.conversation import Conversation
from app.models.deployment import Deployment, TargetSegment
from app.models.integration import IntegrationConnection, IntegrationDelivery
from app.models.logic import LogicAsset
from app.models.subflow import Subflow
from app.models.team import AuditLog, BotCollaborator
from app.models.user import User
from app.schemas.admin import (
    AdminAuditRead,
    AdminBotRead,
    AdminBotUpdate,
    AdminDeliveryRead,
    AdminOverview,
    AdminUserCreate,
    AdminUserRead,
    AdminUserUpdate,
)
from app.security import hash_password
from app.services.audit import record_audit


router = APIRouter(dependencies=[Depends(get_super_admin)])

# Tables whose rows are owned by a user; used when transferring an account's content.
OWNED_MODELS = (Bot, Subflow, LogicAsset, IntegrationConnection, TargetSegment)


def _count(db: Session, statement) -> int:
    return int(db.scalar(statement) or 0)


def _superadmin_count(db: Session, exclude: UUID | None = None) -> int:
    statement = select(func.count(User.id)).where(User.role == "superadmin", User.is_active.is_(True))
    if exclude is not None:
        statement = statement.where(User.id != exclude)
    return _count(db, statement)


@router.get("/overview", response_model=AdminOverview)
def overview(db: Annotated[Session, Depends(get_db)]) -> AdminOverview:
    week_ago = datetime.now(UTC) - timedelta(days=7)
    return AdminOverview(
        users_total=_count(db, select(func.count(User.id))),
        users_active=_count(db, select(func.count(User.id)).where(User.is_active.is_(True))),
        bots_total=_count(db, select(func.count(Bot.id))),
        bots_published=_count(db, select(func.count(Bot.id)).where(Bot.status == "published")),
        bots_archived=_count(db, select(func.count(Bot.id)).where(Bot.status == "archived")),
        conversations_total=_count(db, select(func.count(Conversation.id))),
        conversations_last_7_days=_count(db, select(func.count(Conversation.id)).where(Conversation.started_at >= week_ago)),
        conversations_completed=_count(db, select(func.count(Conversation.id)).where(Conversation.status == "completed")),
        deployments_active=_count(db, select(func.count(Deployment.id)).where(Deployment.status == "active")),
        deliveries_pending=_count(db, select(func.count(IntegrationDelivery.id)).where(IntegrationDelivery.status == "pending")),
        deliveries_failed=_count(db, select(func.count(IntegrationDelivery.id)).where(IntegrationDelivery.status == "failed")),
        subflows_total=_count(db, select(func.count(Subflow.id))),
        logic_assets_total=_count(db, select(func.count(LogicAsset.id))),
    )


def _user_read(user: User, bot_count: int) -> AdminUserRead:
    return AdminUserRead(id=user.id, name=user.name, email=user.email, role=user.role, is_active=user.is_active, created_at=user.created_at, bot_count=bot_count)


@router.get("/users", response_model=list[AdminUserRead])
def list_users(db: Annotated[Session, Depends(get_db)], q: str = Query(default="", max_length=200)) -> list[AdminUserRead]:
    bot_counts = select(Bot.user_id, func.count(Bot.id).label("bot_count")).group_by(Bot.user_id).subquery()
    statement = select(User, func.coalesce(bot_counts.c.bot_count, 0)).outerjoin(bot_counts, bot_counts.c.user_id == User.id)
    if q.strip():
        needle = f"%{q.strip().lower()}%"
        statement = statement.where(func.lower(User.email).like(needle) | func.lower(User.name).like(needle))
    rows = db.execute(statement.order_by(User.created_at.desc())).all()
    return [_user_read(user, int(count)) for user, count in rows]


@router.post("/users", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreate, db: Annotated[Session, Depends(get_db)]) -> AdminUserRead:
    email = payload.email.lower()
    if db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(name=payload.name.strip(), email=email, password_hash=hash_password(payload.password), role=payload.role, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_read(user, 0)


@router.patch("/users/{user_id}", response_model=AdminUserRead)
def update_user(user_id: UUID, payload: AdminUserUpdate, admin: Annotated[User, Depends(get_super_admin)], db: Annotated[Session, Depends(get_db)]) -> AdminUserRead:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    values = payload.model_dump(exclude_unset=True)
    losing_admin = (values.get("role") == "user" or values.get("is_active") is False) and user.role == "superadmin"
    if losing_admin and user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot remove your own admin access")
    if losing_admin and _superadmin_count(db, exclude=user.id) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one active super admin must remain")
    if "name" in values and values["name"] is not None:
        user.name = values["name"].strip()
    if "role" in values and values["role"] is not None:
        user.role = values["role"]
    if "is_active" in values and values["is_active"] is not None:
        user.is_active = values["is_active"]
    if values.get("password"):
        user.password_hash = hash_password(values["password"])
    db.commit()
    db.refresh(user)
    bot_count = _count(db, select(func.count(Bot.id)).where(Bot.user_id == user.id))
    return _user_read(user, bot_count)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    admin: Annotated[User, Depends(get_super_admin)],
    db: Annotated[Session, Depends(get_db)],
    transfer_to: UUID | None = Query(default=None, description="Move the user's bots and assets to this account instead of deleting them"),
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    if user.role == "superadmin" and _superadmin_count(db, exclude=user.id) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one active super admin must remain")
    if transfer_to is not None:
        target = db.get(User, transfer_to)
        if target is None or target.id == user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a different account to receive the content")
        for model in OWNED_MODELS:
            db.execute(update(model).where(model.user_id == user.id).values(user_id=target.id))
        # The new owner must not also appear as a collaborator on bots they now own.
        owned_bot_ids = select(Bot.id).where(Bot.user_id == target.id)
        db.execute(BotCollaborator.__table__.delete().where(BotCollaborator.user_id == target.id, BotCollaborator.bot_id.in_(owned_bot_ids)))
    db.delete(user)
    db.commit()


def _bot_rows(db: Session, statement):
    conversation_counts = select(Conversation.bot_id, func.count(Conversation.id).label("conversations")).group_by(Conversation.bot_id).subquery()
    deployment_counts = select(Deployment.bot_id, func.count(Deployment.id).label("deployments")).where(Deployment.status != "archived").group_by(Deployment.bot_id).subquery()
    published = select(BotVersion.bot_id, func.max(BotVersion.version_number).label("version")).where(BotVersion.published.is_(True)).group_by(BotVersion.bot_id).subquery()
    full = (
        statement.add_columns(User, func.coalesce(conversation_counts.c.conversations, 0), func.coalesce(deployment_counts.c.deployments, 0), published.c.version)
        .join(User, User.id == Bot.user_id)
        .outerjoin(conversation_counts, conversation_counts.c.bot_id == Bot.id)
        .outerjoin(deployment_counts, deployment_counts.c.bot_id == Bot.id)
        .outerjoin(published, published.c.bot_id == Bot.id)
    )
    return [
        AdminBotRead(
            id=bot.id, name=bot.name, slug=bot.slug, status=bot.status, owner_id=owner.id, owner_email=owner.email, owner_name=owner.name,
            created_at=bot.created_at, updated_at=bot.updated_at, conversation_count=int(conversations), deployment_count=int(deployments), published_version=version,
        )
        for bot, owner, conversations, deployments, version in db.execute(full).all()
    ]


@router.get("/bots", response_model=list[AdminBotRead])
def list_bots(db: Annotated[Session, Depends(get_db)], q: str = Query(default="", max_length=200), status_filter: str = Query(default="", alias="status")) -> list[AdminBotRead]:
    statement = select(Bot)
    if q.strip():
        needle = f"%{q.strip().lower()}%"
        statement = statement.where(func.lower(Bot.name).like(needle) | func.lower(Bot.slug).like(needle))
    if status_filter:
        statement = statement.where(Bot.status == status_filter)
    return _bot_rows(db, statement.order_by(Bot.updated_at.desc()))


@router.patch("/bots/{bot_id}", response_model=AdminBotRead)
def update_bot(bot_id: UUID, payload: AdminBotUpdate, admin: Annotated[User, Depends(get_super_admin)], db: Annotated[Session, Depends(get_db)]) -> AdminBotRead:
    bot = db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    if payload.owner_id is not None and payload.owner_id != bot.user_id:
        target = db.get(User, payload.owner_id)
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="New owner not found")
        previous = bot.user_id
        bot.user_id = target.id
        db.execute(BotCollaborator.__table__.delete().where(BotCollaborator.bot_id == bot.id, BotCollaborator.user_id == target.id))
        record_audit(db, bot.id, admin.id, "admin.bot_transferred", "bot", str(bot.id), {"from": str(previous), "to": str(target.id)})
    if payload.status is not None and payload.status != bot.status:
        if payload.status == "published" and not db.scalar(select(BotVersion.id).where(BotVersion.bot_id == bot.id, BotVersion.published.is_(True))):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This bot has no published version yet")
        record_audit(db, bot.id, admin.id, "admin.bot_status_changed", "bot", str(bot.id), {"from": bot.status, "to": payload.status})
        bot.status = payload.status
    db.commit()
    return _bot_rows(db, select(Bot).where(Bot.id == bot.id))[0]


@router.get("/audit", response_model=list[AdminAuditRead])
def audit(db: Annotated[Session, Depends(get_db)], limit: int = Query(default=100, ge=1, le=500)) -> list[AdminAuditRead]:
    rows = db.execute(
        select(AuditLog, Bot.name, User.email).outerjoin(Bot, Bot.id == AuditLog.bot_id).outerjoin(User, User.id == AuditLog.user_id).order_by(AuditLog.created_at.desc()).limit(limit)
    ).all()
    return [
        AdminAuditRead(id=item.id, created_at=item.created_at, action=item.action, entity_type=item.entity_type, entity_id=item.entity_id, details=item.details, bot_id=item.bot_id, bot_name=bot_name, user_id=item.user_id, user_email=email)
        for item, bot_name, email in rows
    ]


def _delivery_rows(db: Session, statement) -> list[AdminDeliveryRead]:
    full = statement.add_columns(Bot.name, IntegrationConnection.name, IntegrationConnection.kind).outerjoin(Bot, Bot.id == IntegrationDelivery.bot_id).outerjoin(IntegrationConnection, IntegrationConnection.id == IntegrationDelivery.connection_id)
    return [
        AdminDeliveryRead(id=item.id, created_at=item.created_at, bot_id=item.bot_id, bot_name=bot_name, event=item.event, status=item.status, attempt_count=item.attempt_count, next_attempt_at=item.next_attempt_at, last_error=item.last_error, connection_name=connection_name, provider=kind)
        for item, bot_name, connection_name, kind in db.execute(full).all()
    ]


@router.get("/deliveries", response_model=list[AdminDeliveryRead])
def deliveries(db: Annotated[Session, Depends(get_db)], status_filter: str = Query(default="", alias="status"), limit: int = Query(default=100, ge=1, le=500)) -> list[AdminDeliveryRead]:
    statement = select(IntegrationDelivery)
    if status_filter:
        statement = statement.where(IntegrationDelivery.status == status_filter)
    return _delivery_rows(db, statement.order_by(IntegrationDelivery.created_at.desc()).limit(limit))


@router.post("/deliveries/{delivery_id}/retry", response_model=AdminDeliveryRead)
def retry_delivery(delivery_id: UUID, db: Annotated[Session, Depends(get_db)]) -> AdminDeliveryRead:
    item = db.get(IntegrationDelivery, delivery_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delivery not found")
    item.status = "pending"
    item.next_attempt_at = datetime.now(UTC)
    item.last_error = ""
    db.commit()
    return _delivery_rows(db, select(IntegrationDelivery).where(IntegrationDelivery.id == item.id))[0]
