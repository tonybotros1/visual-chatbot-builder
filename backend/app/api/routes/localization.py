from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.routes.bots import owned_bot
from app.database.session import get_db
from app.models.localization import BotLocale
from app.models.user import User
from app.schemas.localization import BotLocaleCreate, BotLocaleRead, BotLocaleUpdate


router = APIRouter()


@router.get("/{bot_id}/locales", response_model=list[BotLocaleRead])
def locales(bot_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> list[BotLocale]:
    owned_bot(bot_id, user, db)
    return list(db.scalars(select(BotLocale).where(BotLocale.bot_id == bot_id).order_by(BotLocale.is_default.desc(), BotLocale.locale)))


@router.post("/{bot_id}/locales", response_model=BotLocaleRead, status_code=201)
def create_locale(bot_id: UUID, payload: BotLocaleCreate, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> BotLocale:
    owned_bot(bot_id, user, db, "editor")
    locale = payload.locale.replace("_", "-").lower()
    if db.scalar(select(BotLocale.id).where(BotLocale.bot_id == bot_id, BotLocale.locale == locale)):
        raise HTTPException(status_code=409, detail="This locale already exists")
    if payload.is_default or not db.scalar(select(BotLocale.id).where(BotLocale.bot_id == bot_id)):
        db.execute(update(BotLocale).where(BotLocale.bot_id == bot_id).values(is_default=False)); is_default = True
    else: is_default = False
    item = BotLocale(bot_id=bot_id, locale=locale, name=payload.name.strip(), direction=payload.direction, translations=payload.translations, is_default=is_default)
    db.add(item); db.commit(); db.refresh(item); return item


@router.put("/{bot_id}/locales/{locale_id}", response_model=BotLocaleRead)
def update_locale(bot_id: UUID, locale_id: UUID, payload: BotLocaleUpdate, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> BotLocale:
    owned_bot(bot_id, user, db, "editor")
    item = db.scalar(select(BotLocale).where(BotLocale.id == locale_id, BotLocale.bot_id == bot_id))
    if item is None: raise HTTPException(status_code=404, detail="Locale not found")
    values = payload.model_dump(exclude_unset=True)
    if values.get("is_default") is True: db.execute(update(BotLocale).where(BotLocale.bot_id == bot_id).values(is_default=False))
    for key, value in values.items(): setattr(item, key, value.strip() if key == "name" else value)
    db.commit(); db.refresh(item); return item


@router.delete("/{bot_id}/locales/{locale_id}", status_code=204)
def delete_locale(bot_id: UUID, locale_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> None:
    owned_bot(bot_id, user, db, "editor")
    item = db.scalar(select(BotLocale).where(BotLocale.id == locale_id, BotLocale.bot_id == bot_id))
    if item is None: raise HTTPException(status_code=404, detail="Locale not found")
    if item.is_default: raise HTTPException(status_code=409, detail="Choose another default locale before deleting this one")
    db.delete(item); db.commit()
