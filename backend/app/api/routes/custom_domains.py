from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.platform import public_site_url
from app.database.session import get_db
from app.models.bot import Bot
from app.models.deployment import CustomDomain, Deployment
from app.services.custom_domains import VERIFICATION_PATH, chat_page, notice_page, request_host

# Public endpoints the reverse proxy calls for custom domains (mounted under /api/public).
router = APIRouter()


@router.get("/domains/ask")
def may_issue_certificate(domain: str, db: Annotated[Session, Depends(get_db)]) -> dict[str, bool]:
    """The proxy asks this before requesting an HTTPS certificate: yes only for hostnames registered here."""
    hostname = domain.strip().lower().rstrip(".")
    if db.scalar(select(CustomDomain.id).where(CustomDomain.hostname == hostname)) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown domain")
    return {"ok": True}


@router.get("/domains/site")
def domain_site(request: Request, db: Annotated[Session, Depends(get_db)]) -> Response:
    """What a visitor sees on a custom domain: the bot's chat, full window. The proxy sends every request
    on such a hostname here, with the original host in X-Forwarded-Host and the path in X-Forwarded-Uri."""
    hostname = request_host(request.headers)
    path = (request.headers.get("x-forwarded-uri") or "/").split("?", 1)[0]
    domain = db.scalar(select(CustomDomain).where(CustomDomain.hostname == hostname))
    if domain is None:
        return HTMLResponse(notice_page(title="Domain not connected", message="This address is not connected to a chatbot."), status_code=404)
    if path == VERIFICATION_PATH:
        return PlainTextResponse(domain.verification_token)
    deployment = db.get(Deployment, domain.deployment_id)
    bot = db.get(Bot, deployment.bot_id) if deployment else None
    if bot is None or bot.status != "published":
        return HTMLResponse(notice_page(title="Not available yet", message="This chatbot has not been published yet. Please check back soon."), status_code=404)
    site = public_site_url(db) or str(request.base_url).rstrip("/")
    return HTMLResponse(
        chat_page(title=bot.name, chat_url=f"{site}/chat/{bot.slug}"),
        # The wrapper is tiny and its target may change when the bot's link name changes.
        headers={"Cache-Control": "no-store"},
    )
