import re
import secrets
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.routes.platform import bot_sharing_mode
from app.api.routes.workspaces import visible_workspace
from app.database.seed import DEFAULT_FLOW
from app.database.session import get_db
from app.models.bot import Bot, BotVersion
from app.models.localization import BotLocale
from app.models.user import User
from app.models.team import BotCollaborator
from app.models.workspace import Workspace
from app.schemas.bot import BotCreate, BotRead, BotUpdate


router = APIRouter()


ROLE_RANK = {"viewer": 1, "editor": 2, "admin": 3, "owner": 4}


def resolve_role(*, is_owner: bool, is_platform_admin: bool, collaborator_role: str | None, sharing_mode: str) -> str | None:
    """The role a user holds on a bot, or None when they may not see it at all.

    Owners and platform admins hold every right. Invited collaborators keep their invited role, but a
    platform sharing mode never lowers it: "view" gives everyone at least viewer, "edit" at least editor.
    """
    if is_owner:
        return "owner"
    if is_platform_admin:
        return "admin"
    shared = {"view": "viewer", "edit": "editor"}.get(sharing_mode)
    if collaborator_role is None:
        return shared
    if shared and ROLE_RANK.get(shared, 0) > ROLE_RANK.get(collaborator_role, 0):
        return shared
    return collaborator_role


def access_role(bot: Bot, user: User, db: Session) -> str | None:
    collaborator = db.scalar(select(BotCollaborator.role).where(BotCollaborator.bot_id == bot.id, BotCollaborator.user_id == user.id))
    return resolve_role(
        is_owner=bot.user_id == user.id,
        is_platform_admin=user.role == "superadmin",
        collaborator_role=collaborator,
        sharing_mode=bot_sharing_mode(db),
    )


def owned_bot(bot_id: UUID, user: User, db: Session, minimum_role: str = "viewer") -> Bot:
    bot = db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    role = access_role(bot, user, db)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    if ROLE_RANK.get(role, 0) < ROLE_RANK.get(minimum_role, 1):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"This action needs the {minimum_role} role")
    return bot


SHARE_CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/l/I look-alikes


def ensure_share_code(bot: Bot, db: Session) -> str:
    """Give the bot a 7-character code for /r/<code> links the first time it is needed."""
    if bot.share_code:
        return bot.share_code
    for _ in range(20):
        candidate = "".join(secrets.choice(SHARE_CODE_ALPHABET) for _ in range(7))
        if not db.scalar(select(Bot.id).where(Bot.share_code == candidate)):
            bot.share_code = candidate
            db.commit()
            return candidate
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not allocate a share code")


def bot_read(bot: Bot, user: User, db: Session, *, role: str | None = None, owner: User | None = None) -> BotRead:
    owner = owner or db.get(User, bot.user_id)
    return BotRead(
        id=bot.id, name=bot.name, slug=bot.slug, description=bot.description, status=bot.status,
        workspace_id=bot.workspace_id, created_at=bot.created_at, updated_at=bot.updated_at,
        owner_id=bot.user_id, owner_name=owner.name if owner else "", access_role=role or access_role(bot, user, db) or "viewer",
        share_code=ensure_share_code(bot, db),
    )


def workspace_for(workspace_id: UUID | None, user: User, db: Session) -> UUID | None:
    """Resolve a workspace id from a payload: the caller's own, or any workspace when sharing is on."""
    if workspace_id is None:
        return None
    try:
        return visible_workspace(workspace_id, user, db).id
    except HTTPException as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Workspace not found") from exc


def normalize_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:160]


def unique_slug(name: str, db: Session, *, bot_id: UUID | None = None) -> str:
    base = normalize_slug(name) or "bot"
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
) -> list[BotRead]:
    sharing = bot_sharing_mode(db)
    everyone = sharing in {"view", "edit"} or user.role == "superadmin"
    statement = select(Bot, User).join(User, User.id == Bot.user_id).where(Bot.status != "archived")
    if not everyone:
        statement = statement.where(
            or_(
                Bot.user_id == user.id,
                exists(select(BotCollaborator.id).where(BotCollaborator.bot_id == Bot.id, BotCollaborator.user_id == user.id)),
            )
        )
    rows = db.execute(statement.order_by(Bot.updated_at.desc())).all()
    invited = {
        bot_id: role
        for bot_id, role in db.execute(select(BotCollaborator.bot_id, BotCollaborator.role).where(BotCollaborator.user_id == user.id)).all()
    }
    return [
        bot_read(
            bot, user, db, owner=owner,
            role=resolve_role(is_owner=bot.user_id == user.id, is_platform_admin=user.role == "superadmin", collaborator_role=invited.get(bot.id), sharing_mode=sharing) or "viewer",
        )
        for bot, owner in rows
    ]


@router.post("", response_model=BotRead, status_code=status.HTTP_201_CREATED)
def create_bot(
    payload: BotCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BotRead:
    bot = Bot(
        user_id=user.id,
        workspace_id=workspace_for(payload.workspace_id, user, db),
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
    return bot_read(bot, user, db, role="owner", owner=user)


@router.post("/{bot_id}/duplicate", response_model=BotRead, status_code=status.HTTP_201_CREATED)
def duplicate_bot(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BotRead:
    """A fresh draft bot owned by the caller with the source bot's current draft flow and languages."""
    source = owned_bot(bot_id, user, db)
    draft = db.scalar(
        select(BotVersion)
        .where(BotVersion.bot_id == source.id, BotVersion.published.is_(False))
        .order_by(BotVersion.version_number.desc())
    ) or db.scalar(select(BotVersion).where(BotVersion.bot_id == source.id).order_by(BotVersion.version_number.desc()))
    base_name = re.sub(r"\s+\(copy(?: \d+)?\)$", "", source.name).strip() or source.name
    name = f"{base_name} (copy)"
    if len(name) > 160:
        name = name[:153].rstrip() + " (copy)"
    copy = Bot(
        user_id=user.id,
        workspace_id=workspace_for(source.workspace_id, user, db) if source.workspace_id else None,
        name=name,
        slug=unique_slug(name, db),
        description=source.description,
        status="draft",
    )
    db.add(copy)
    db.flush()
    db.add(BotVersion(bot_id=copy.id, version_number=0, flow_json=dict(draft.flow_json) if draft else DEFAULT_FLOW, published=False))
    for locale in db.scalars(select(BotLocale).where(BotLocale.bot_id == source.id)):
        db.add(BotLocale(bot_id=copy.id, locale=locale.locale, name=locale.name, direction=locale.direction, translations=dict(locale.translations or {}), is_default=locale.is_default))
    db.commit()
    db.refresh(copy)
    return bot_read(copy, user, db, role="owner", owner=user)


@router.get("/{bot_id}", response_model=BotRead)
def get_bot(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BotRead:
    bot = owned_bot(bot_id, user, db)
    return bot_read(bot, user, db)


@router.put("/{bot_id}", response_model=BotRead)
def update_bot(
    bot_id: UUID,
    payload: BotUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BotRead:
    bot = owned_bot(bot_id, user, db, "admin")
    if payload.name is not None:
        # The public link stays stable on rename; the slug only changes when set explicitly.
        bot.name = payload.name.strip()
    if payload.slug is not None:
        slug = normalize_slug(payload.slug)
        if len(slug) < 2:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="The link must contain at least two letters or numbers")
        if db.scalar(select(Bot.id).where(Bot.slug == slug, Bot.id != bot.id)):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This link is already used by another bot")
        bot.slug = slug
    if payload.description is not None:
        bot.description = payload.description
    if payload.status in {"draft", "published", "archived"}:
        bot.status = payload.status
    if "workspace_id" in payload.model_fields_set:
        # Filing a bot into a workspace is an admin-level action: the owner, an admin collaborator or a platform admin.
        bot.workspace_id = workspace_for(payload.workspace_id, user, db)
    db.commit()
    db.refresh(bot)
    return bot_read(bot, user, db)


@router.delete("/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_bot(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    bot = owned_bot(bot_id, user, db, "admin")
    bot.status = "archived"
    # Release the public link so a replacement bot can reuse it.
    bot.slug = unique_slug(f"{bot.slug}-archived", db, bot_id=bot.id)
    db.commit()
