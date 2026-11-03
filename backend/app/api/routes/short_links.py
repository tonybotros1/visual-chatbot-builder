"""Public resolver for short share links: /r/<code> → which published bot to open (always its latest published version)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.bot import Bot


router = APIRouter()


class ShortLinkTarget(BaseModel):
    slug: str
    name: str


@router.get("/r/{code}", response_model=ShortLinkTarget)
def resolve_short_link(code: str, db: Annotated[Session, Depends(get_db)]) -> ShortLinkTarget:
    bot = db.scalar(select(Bot).where(Bot.share_code == code.strip()))
    if bot is None or bot.status != "published":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This link is not active")
    return ShortLinkTarget(slug=bot.slug, name=bot.name)
