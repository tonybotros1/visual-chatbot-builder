from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.routes.bots import owned_bot
from app.database.session import get_db
from app.models.bot import Bot
from app.models.integration import BotEventSubscription, IntegrationConnection, IntegrationDelivery
from app.models.user import User
from app.schemas.integration import (
    DeliveryRead,
    IntegrationCreate,
    IntegrationRead,
    IntegrationUpdate,
    SubscriptionCreate,
    SubscriptionRead,
)
from app.services.integrations import deliver, validate_webhook_url
from app.services.secret_vault import encrypt_secrets


router = APIRouter()


def _read(connection: IntegrationConnection) -> IntegrationRead:
    return IntegrationRead(
        id=connection.id, kind=connection.kind, name=connection.name, config=connection.config or {},
        has_secrets=bool(connection.encrypted_secrets), status=connection.status,
        created_at=connection.created_at, updated_at=connection.updated_at,
    )


def _owned(connection_id: UUID, user: User, db: Session) -> IntegrationConnection:
    connection = db.scalar(select(IntegrationConnection).where(IntegrationConnection.id == connection_id, IntegrationConnection.user_id == user.id))
    if connection is None:
        raise HTTPException(status_code=404, detail="Integration connection not found")
    return connection


def _validate_config(kind: str, config: dict) -> None:
    if kind in {"webhook", "slack", "sms"} and not (kind == "sms" and config.get("mode") == "sandbox"):
        try:
            validate_webhook_url(str(config.get("url") or ""))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    if kind == "email" and not all(config.get(key) for key in ("host", "from_email", "to_email")):
        raise HTTPException(status_code=422, detail="Email connections require host, from_email, and to_email")


@router.get("", response_model=list[IntegrationRead])
def list_connections(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> list[IntegrationRead]:
    items = db.scalars(select(IntegrationConnection).where(IntegrationConnection.user_id == user.id).order_by(IntegrationConnection.updated_at.desc()))
    return [_read(item) for item in items]


@router.post("", response_model=IntegrationRead, status_code=201)
def create_connection(payload: IntegrationCreate, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> IntegrationRead:
    _validate_config(payload.kind, payload.config)
    item = IntegrationConnection(user_id=user.id, kind=payload.kind, name=payload.name.strip(), config=payload.config, encrypted_secrets=encrypt_secrets(payload.secrets))
    db.add(item); db.commit(); db.refresh(item)
    return _read(item)


@router.put("/{connection_id}", response_model=IntegrationRead)
def update_connection(connection_id: UUID, payload: IntegrationUpdate, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> IntegrationRead:
    item = _owned(connection_id, user, db)
    values = payload.model_dump(exclude_unset=True)
    if "config" in values:
        _validate_config(item.kind, values["config"])
    secrets = values.pop("secrets", None)
    for key, value in values.items(): setattr(item, key, value.strip() if key == "name" else value)
    if secrets is not None: item.encrypted_secrets = encrypt_secrets(secrets)
    db.commit(); db.refresh(item)
    return _read(item)


@router.delete("/{connection_id}", status_code=204)
def disable_connection(connection_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> None:
    item = _owned(connection_id, user, db); item.status = "disabled"; db.commit()


@router.get("/bots/{bot_id}/subscriptions", response_model=list[SubscriptionRead])
def subscriptions(bot_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> list[BotEventSubscription]:
    owned_bot(bot_id, user, db)
    return list(db.scalars(select(BotEventSubscription).where(BotEventSubscription.bot_id == bot_id).order_by(BotEventSubscription.created_at.desc())))


@router.post("/bots/{bot_id}/subscriptions", response_model=SubscriptionRead, status_code=201)
def subscribe(bot_id: UUID, payload: SubscriptionCreate, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> BotEventSubscription:
    owned_bot(bot_id, user, db, "admin"); _owned(payload.connection_id, user, db)
    existing = db.scalar(select(BotEventSubscription).where(BotEventSubscription.bot_id == bot_id, BotEventSubscription.connection_id == payload.connection_id, BotEventSubscription.event == payload.event))
    if existing: return existing
    item = BotEventSubscription(bot_id=bot_id, connection_id=payload.connection_id, event=payload.event)
    db.add(item); db.commit(); db.refresh(item); return item


@router.delete("/subscriptions/{subscription_id}", status_code=204)
def unsubscribe(subscription_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> None:
    item = db.get(BotEventSubscription, subscription_id)
    if item is None: raise HTTPException(status_code=404, detail="Subscription not found")
    owned_bot(item.bot_id, user, db, "admin"); db.delete(item); db.commit()


@router.get("/deliveries", response_model=list[DeliveryRead])
def deliveries(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> list[IntegrationDelivery]:
    return list(db.scalars(select(IntegrationDelivery).join(Bot, IntegrationDelivery.bot_id == Bot.id).where(Bot.user_id == user.id).order_by(IntegrationDelivery.created_at.desc()).limit(300)))


@router.post("/deliveries/{delivery_id}/retry", response_model=DeliveryRead)
def retry_delivery(delivery_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> IntegrationDelivery:
    item = db.scalar(select(IntegrationDelivery).join(Bot, IntegrationDelivery.bot_id == Bot.id).where(IntegrationDelivery.id == delivery_id, Bot.user_id == user.id))
    if item is None: raise HTTPException(status_code=404, detail="Delivery not found")
    item.status = "pending"; item.next_attempt_at = None; db.commit(); deliver(db, item); db.refresh(item); return item
