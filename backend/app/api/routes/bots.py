import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.database.seed import DEFAULT_FLOW
from app.database.session import get_db
from app.models.bot import Bot, BotVersion
from app.models.user import User
from app.models.team import BotCollaborator
from app.schemas.bot import BotCreate, BotRead, BotUpdate


router = APIRouter()


ROLE_RANK = {"viewer": 1, "editor": 2, "admin": 3}


def owned_bot(bot_id: UUID, user: User, db: Session, minimum_role: str = "viewer") -> Bot:
    bot = db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    if bot.user_id != user.id:
        collaborator = db.scalar(select(BotCollaborator).where(BotCollaborator.bot_id == bot_id, BotCollaborator.user_id == user.id))
        if collaborator is None or ROLE_RANK.get(collaborator.role, 0) < ROLE_RANK.get(minimum_role, 1):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    return bot


def unique_slug(name: str, db: Session, *, bot_id: UUID | None = None) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "bot"
    slug = base
    counter = 2
    while db.scalar(select(Bot.id).where(Bot.slug == slug, Bot.id != bot_id)):
        slug = f"{base}-{counter}"
        counter += 1
    return slug


@router.get("", response_model=list[BotRead])
def list_bots(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Bot]:
    return list(
        db.scalars(
            select(Bot)
            .where(
                or_(
                    Bot.user_id == user.id,
                    exists(select(BotCollaborator.id).where(BotCollaborator.bot_id == Bot.id, BotCollaborator.user_id == user.id)),
                ),
                Bot.status != "archived",
            )
            .order_by(Bot.updated_at.desc())
        )
    )


@router.post("", response_model=BotRead, status_code=status.HTTP_201_CREATED)
def create_bot(
    payload: BotCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Bot:
    bot = Bot(
        user_id=user.id,
        name=payload.name.strip(),
        slug=unique_slug(payload.name, db),
        description=payload.description,
        status="draft",
    )
    db.add(bot)
    db.flush()
    db.add(BotVersion(bot_id=bot.id, version_number=0, flow_json=DEFAULT_FLOW, published=False))
    db.commit()
    db.refresh(bot)
    return bot


@router.get("/{bot_id}", response_model=BotRead)
def get_bot(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Bot:
    return owned_bot(bot_id, user, db)


@router.put("/{bot_id}", response_model=BotRead)
def update_bot(
    bot_id: UUID,
    payload: BotUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Bot:
    bot = owned_bot(bot_id, user, db, "admin")
    if payload.name is not None:
        bot.name = payload.name.strip()
        bot.slug = unique_slug(bot.name, db, bot_id=bot.id)
    if payload.description is not None:
        bot.description = payload.description
    if payload.status in {"draft", "published", "archived"}:
        bot.status = payload.status
    db.commit()
    db.refresh(bot)
    return bot


@router.delete("/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_bot(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    bot = owned_bot(bot_id, user, db, "admin")
    bot.status = "archived"
    db.commit()
