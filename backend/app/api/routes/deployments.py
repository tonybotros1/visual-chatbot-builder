import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from ipaddress import ip_address
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from jose import JWTError, jwt
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.api.routes.bots import owned_bot
from app.api.routes.conversations import _start
from app.config import get_settings
from app.database.session import get_db
from app.engine.targeting import evaluate_targeting
from app.models.bot import Bot, BotVersion
from app.models.deployment import CustomDomain, Deployment, TargetSegment
from app.models.user import User
from app.schemas.conversation import ConversationStart, ConversationState
from app.schemas.deployment import (
    rules_dict,
    DeploymentBootstrap,
    DeploymentCreate,
    DeploymentRead,
    DeploymentUpdate,
    TargetSegmentCreate,
    TargetSegmentRead,
    TargetSegmentUpdate,
    CustomDomainCreate,
    CustomDomainRead,
)
from app.services.integrations import _ensure_public_destination
from app.security import ALGORITHM


router = APIRouter()
public_router = APIRouter()


@public_router.get("/sdk/v1.js")
def javascript_sdk(request: Request) -> Response:
    api_base = str(request.base_url).rstrip("/")
    script = f"""(() => {{
  if (window.VisualChatbot) return;
  const instances = new Map();
  const apiBase = {json.dumps(api_base)};
  function css(node, value) {{ node.style.cssText = value; return node; }}
  async function init(options) {{
    if (!options || !options.deploymentKey) throw new Error('deploymentKey is required');
    const key = options.deploymentKey;
    if (instances.has(key)) return instances.get(key).api;
    const context = Object.assign({{}}, options.context || {{}}, {{url: location.href, referrer: document.referrer, language: options.locale || navigator.language}});
    const query = new URLSearchParams(); Object.entries(context).forEach(([name, value]) => value != null && query.set(name, String(value)));
    const response = await fetch(`${{apiBase}}/api/public/deployments/${{encodeURIComponent(key)}}/bootstrap?${{query}}`);
    if (!response.ok) throw new Error(`Chatbot bootstrap failed (${{response.status}})`);
    const data = await response.json();
    if (!data.eligible) return {{eligible:false,reasons:data.reasons,destroy(){{}}}};
    const config = Object.assign({{}}, data.config || {{}}, options || {{}});
    const base = String(config.frontend_url || 'http://localhost:3000').replace(/[/]$/, '');
    const iframe = css(document.createElement('iframe'), 'border:0;width:100%;height:100%;background:#fff');
    iframe.src = `${{base}}/chat/${{data.bot_slug}}?deployment=${{encodeURIComponent(key)}}&eligibility=${{encodeURIComponent(data.eligibility_token)}}${{config.locale ? '&lang=' + encodeURIComponent(config.locale) : ''}}`;
    iframe.title = config.title || config.launcher_label || 'Chat';
    iframe.allow = 'payment; clipboard-write';
    const panel = css(document.createElement('div'), data.mode === 'embed' ? 'width:100%;height:620px;max-width:520px' : 'display:none;position:fixed;right:24px;bottom:88px;width:min(390px,calc(100vw - 32px));height:min(620px,calc(100vh - 120px));z-index:2147483646;border-radius:18px;overflow:hidden;box-shadow:0 20px 70px rgba(0,0,0,.28)');
    panel.appendChild(iframe);
    const mount = config.target ? document.querySelector(config.target) : null;
    (mount || document.body).appendChild(panel);
    let button = null;
    if (data.mode !== 'embed') {{
      button = css(document.createElement('button'), `position:fixed;right:24px;bottom:24px;z-index:2147483647;border:0;border-radius:999px;padding:14px 20px;color:#fff;font:600 15px system-ui;background:${{config.primary_color || '#6d5dfc'}};box-shadow:0 12px 32px rgba(0,0,0,.22);cursor:pointer`);
      button.type='button'; button.textContent=config.launcher_label || 'Chat'; button.addEventListener('click', () => api.toggle()); document.body.appendChild(button);
    }}
    const listeners = new Map();
    const onMessage = event => {{ if (event.source !== iframe.contentWindow || event.data?.type !== 'visual-chatbot:event') return; (listeners.get(event.data.event) || []).forEach(callback => callback(event.data.payload)); }};
    window.addEventListener('message', onMessage);
    const api = {{
      eligible:true,
      open(){{ panel.style.display='block'; }},
      close(){{ if(data.mode !== 'embed') panel.style.display='none'; }},
      toggle(){{ panel.style.display === 'none' ? api.open() : api.close(); }},
      on(event, callback){{ const values=listeners.get(event)||[]; values.push(callback); listeners.set(event,values); return () => listeners.set(event,(listeners.get(event)||[]).filter(item=>item!==callback)); }},
      destroy(){{ window.removeEventListener('message',onMessage); panel.remove(); button?.remove(); instances.delete(key); }},
      iframe,
    }};
    instances.set(key, {{api}}); if(config.open) api.open(); return api;
  }}
  window.VisualChatbot = {{init, get:key => instances.get(key)?.api}};
  const current = document.currentScript;
  if (current?.dataset.deployment) init({{deploymentKey:current.dataset.deployment,target:current.dataset.target,locale:current.dataset.locale}}).catch(() => undefined);
}})();"""
    return Response(script, media_type="application/javascript", headers={"Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff"})


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "segment"


def _owned_segment(segment_id: UUID, user: User, db: Session) -> TargetSegment:
    segment = db.scalar(
        select(TargetSegment).where(TargetSegment.id == segment_id, TargetSegment.user_id == user.id)
    )
    if segment is None:
        raise HTTPException(status_code=404, detail="Target segment not found")
    return segment


def _owned_deployment(deployment_id: UUID, user: User, db: Session, minimum_role: str = "viewer") -> Deployment:
    deployment = db.get(Deployment, deployment_id)
    if deployment is None:
        raise HTTPException(status_code=404, detail="Deployment not found")
    owned_bot(deployment.bot_id, user, db, minimum_role)
    return deployment


def _latest_published(bot_id: UUID, db: Session) -> BotVersion:
    version = db.scalar(
        select(BotVersion)
        .where(BotVersion.bot_id == bot_id, BotVersion.published.is_(True))
        .order_by(BotVersion.version_number.desc())
    )
    if version is None:
        raise HTTPException(status_code=409, detail="Publish the bot before creating a deployment")
    return version


def _validate_segment_owner(segment_id: UUID | None, user: User, db: Session) -> None:
    if segment_id is not None:
        _owned_segment(segment_id, user, db)


@router.get("/target-segments", response_model=list[TargetSegmentRead])
def list_segments(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[TargetSegment]:
    return list(
        db.scalars(
            select(TargetSegment)
            .where(TargetSegment.user_id == user.id, TargetSegment.status != "archived")
            .order_by(TargetSegment.updated_at.desc())
        )
    )


@router.post("/target-segments", response_model=TargetSegmentRead, status_code=201)
def create_segment(
    payload: TargetSegmentCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TargetSegment:
    base = _slug(payload.name)
    slug = base
    counter = 2
    while db.scalar(select(TargetSegment.id).where(TargetSegment.slug == slug)):
        slug = f"{base}-{counter}"
        counter += 1
    segment = TargetSegment(user_id=user.id, name=payload.name.strip(), slug=slug, rules=rules_dict(payload.rules))
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return segment


@router.put("/target-segments/{segment_id}", response_model=TargetSegmentRead)
def update_segment(
    segment_id: UUID,
    payload: TargetSegmentUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TargetSegment:
    segment = _owned_segment(segment_id, user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(segment, field, value.strip() if field == "name" else value)
    db.commit()
    db.refresh(segment)
    return segment


@router.delete("/target-segments/{segment_id}", status_code=204)
def archive_segment(
    segment_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    segment = _owned_segment(segment_id, user, db)
    segment.status = "archived"
    db.commit()


@router.get("/bots/{bot_id}/deployments", response_model=list[DeploymentRead])
def list_deployments(
    bot_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Deployment]:
    owned_bot(bot_id, user, db)
    return list(
        db.scalars(
            select(Deployment)
            .where(Deployment.bot_id == bot_id, Deployment.status != "archived")
            .order_by(Deployment.updated_at.desc())
        )
    )


@router.post("/bots/{bot_id}/deployments", response_model=DeploymentRead, status_code=201)
def create_deployment(
    bot_id: UUID,
    payload: DeploymentCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Deployment:
    owned_bot(bot_id, user, db, "editor")
    _validate_segment_owner(payload.target_segment_id, user, db)
    version = _latest_published(bot_id, db)
    deployment = Deployment(
        bot_id=bot_id,
        bot_version_id=version.id,
        target_segment_id=payload.target_segment_id,
        name=payload.name.strip(),
        deployment_key=secrets.token_urlsafe(24),
        mode=payload.mode,
        environment=payload.environment,
        config=payload.config,
        rules=rules_dict(payload.rules),
    )
    db.add(deployment)
    db.commit()
    db.refresh(deployment)
    return deployment


@router.put("/deployments/{deployment_id}", response_model=DeploymentRead)
def update_deployment(
    deployment_id: UUID,
    payload: DeploymentUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Deployment:
    deployment = _owned_deployment(deployment_id, user, db, "editor")
    values = payload.model_dump(exclude_unset=True)
    if "target_segment_id" in values:
        _validate_segment_owner(values["target_segment_id"], user, db)
    for field, value in values.items():
        setattr(deployment, field, value.strip() if field == "name" else value)
    db.commit()
    db.refresh(deployment)
    return deployment


@router.post("/deployments/{deployment_id}/refresh-version", response_model=DeploymentRead)
def refresh_deployment_version(
    deployment_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Deployment:
    deployment = _owned_deployment(deployment_id, user, db, "editor")
    deployment.bot_version_id = _latest_published(deployment.bot_id, db).id
    db.commit()
    db.refresh(deployment)
    return deployment


@router.delete("/deployments/{deployment_id}", status_code=204)
def archive_deployment(
    deployment_id: UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    deployment = _owned_deployment(deployment_id, user, db, "editor")
    deployment.status = "archived"
    db.commit()


def _normalize_hostname(value: str) -> str:
    hostname = value.lower().strip().rstrip(".")
    if not re.fullmatch(r"(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", hostname):
        raise HTTPException(status_code=422, detail="Enter a valid public hostname")
    try:
        if ip_address(hostname).is_private: raise HTTPException(status_code=422, detail="Private hosts are not allowed")
    except ValueError: pass
    return hostname


@router.get("/bots/{bot_id}/domains", response_model=list[CustomDomainRead])
def list_domains(bot_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> list[CustomDomain]:
    owned_bot(bot_id, user, db)
    return list(db.scalars(select(CustomDomain).join(Deployment, CustomDomain.deployment_id == Deployment.id).where(Deployment.bot_id == bot_id).order_by(CustomDomain.created_at.desc())))


@router.post("/deployments/{deployment_id}/domains", response_model=CustomDomainRead, status_code=201)
def create_domain(deployment_id: UUID, payload: CustomDomainCreate, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> CustomDomain:
    _owned_deployment(deployment_id, user, db, "admin")
    hostname = _normalize_hostname(payload.hostname)
    if db.scalar(select(CustomDomain.id).where(CustomDomain.hostname == hostname)): raise HTTPException(status_code=409, detail="This hostname is already registered")
    item = CustomDomain(deployment_id=deployment_id, hostname=hostname, verification_token=secrets.token_urlsafe(32))
    db.add(item); db.commit(); db.refresh(item); return item


@router.post("/domains/{domain_id}/verify", response_model=CustomDomainRead)
def verify_domain(domain_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> CustomDomain:
    item = db.get(CustomDomain, domain_id)
    if item is None: raise HTTPException(status_code=404, detail="Custom domain not found")
    _owned_deployment(item.deployment_id, user, db, "admin")
    url = f"https://{item.hostname}/.well-known/visual-chatbot-builder-verification"
    try:
        _ensure_public_destination(url)
        with urlopen(UrlRequest(url, headers={"User-Agent": "VisualChatbotBuilder/2"}), timeout=10) as response:
            value = response.read(500).decode().strip()
    except (ValueError, HTTPError, URLError, OSError, TimeoutError) as exc: raise HTTPException(status_code=422, detail=f"Domain verification failed: {exc}") from exc
    if value != item.verification_token: raise HTTPException(status_code=422, detail="Verification file did not contain the expected token")
    item.status = "verified"; item.verified_at = datetime.now(UTC); db.commit(); db.refresh(item); return item


@router.delete("/domains/{domain_id}", status_code=204)
def delete_domain(domain_id: UUID, user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]) -> None:
    item = db.get(CustomDomain, domain_id)
    if item is None: raise HTTPException(status_code=404, detail="Custom domain not found")
    _owned_deployment(item.deployment_id, user, db, "admin"); db.delete(item); db.commit()


def _context(
    url: str | None,
    referrer: str | None,
    language: str | None,
    country: str | None,
    device: str | None,
    impressions: int,
    shown_this_session: bool,
) -> dict[str, Any]:
    return {
        "url": url,
        "referrer": referrer,
        "language": language,
        "country": country,
        "device": device,
        "impressions": impressions,
        "shown_this_session": shown_this_session,
    }


def _public_deployment(key: str, db: Session) -> tuple[Deployment, Bot, BotVersion]:
    deployment = db.scalar(select(Deployment).where(Deployment.deployment_key == key))
    if deployment is None or deployment.status != "active":
        raise HTTPException(status_code=404, detail="Active deployment not found")
    bot = db.get(Bot, deployment.bot_id)
    version = db.get(BotVersion, deployment.bot_version_id)
    if bot is None or version is None or not version.published:
        raise HTTPException(status_code=409, detail="Deployment version is unavailable")
    return deployment, bot, version


def _evaluate(deployment: Deployment, db: Session, context: dict[str, Any]):
    results = [evaluate_targeting(deployment.rules, context)]
    if deployment.target_segment_id:
        segment = db.get(TargetSegment, deployment.target_segment_id)
        if segment is None or segment.status != "active":
            return False, ["Target segment is unavailable"]
        results.append(evaluate_targeting(segment.rules, context))
    return all(result.eligible for result in results), [reason for result in results for reason in result.reasons]


def _issue_eligibility_token(deployment_key: str) -> str:
    return jwt.encode(
        {
            "deployment_key": deployment_key,
            "purpose": "deployment_eligibility",
            "exp": datetime.now(UTC) + timedelta(minutes=10),
        },
        get_settings().secret_key,
        algorithm=ALGORITHM,
    )


def _verify_eligibility_token(token: str | None, deployment_key: str) -> None:
    if not token:
        raise HTTPException(status_code=403, detail="A valid deployment eligibility token is required")
    try:
        claims = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=403, detail="Deployment eligibility token is invalid or expired") from exc
    if claims.get("purpose") != "deployment_eligibility" or claims.get("deployment_key") != deployment_key:
        raise HTTPException(status_code=403, detail="Deployment eligibility token does not match this deployment")


def _schedule_reasons(deployment: Deployment, db: Session) -> list[str]:
    rule_sets = [deployment.rules]
    if deployment.target_segment_id:
        segment = db.get(TargetSegment, deployment.target_segment_id)
        if segment is None or segment.status != "active":
            return ["Target segment is unavailable"]
        rule_sets.append(segment.rules)
    return [
        reason
        for rules in rule_sets
        for reason in evaluate_targeting(
            {"schedule": (rules or {}).get("schedule", {})},
            {},
        ).reasons
    ]


@public_router.get("/deployments/{deployment_key}/bootstrap", response_model=DeploymentBootstrap)
def bootstrap(
    deployment_key: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    url: str | None = None,
    referrer: str | None = None,
    language: str | None = None,
    country: str | None = None,
    device: str | None = None,
    impressions: Annotated[int, Query(ge=0)] = 0,
    shown_this_session: bool = False,
) -> DeploymentBootstrap:
    deployment, bot, version = _public_deployment(deployment_key, db)
    context = _context(url, referrer, language, country, device, impressions, shown_this_session)
    eligible, reasons = _evaluate(
        deployment,
        db,
        context,
    )
    endpoint = str(request.url_for("deployment_start", deployment_key=deployment_key)) if eligible else None
    return DeploymentBootstrap(
        eligible=eligible,
        reasons=reasons,
        deployment_key=deployment.deployment_key,
        mode=deployment.mode,
        config=deployment.config,
        bot_slug=bot.slug if eligible else None,
        version_number=version.version_number if eligible else None,
        start_endpoint=endpoint,
        eligibility_token=_issue_eligibility_token(deployment_key) if eligible else None,
    )


@public_router.get("/domains/current/bootstrap", response_model=DeploymentBootstrap)
def custom_domain_bootstrap(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    url: str | None = None,
    referrer: str | None = None,
    language: str | None = None,
    country: str | None = None,
    device: str | None = None,
    impressions: Annotated[int, Query(ge=0)] = 0,
    shown_this_session: bool = False,
) -> DeploymentBootstrap:
    hostname = (request.headers.get("x-forwarded-host") or request.url.hostname or "").split(":", 1)[0].lower()
    domain = db.scalar(select(CustomDomain).where(CustomDomain.hostname == hostname, CustomDomain.status == "verified"))
    if domain is None: raise HTTPException(status_code=404, detail="Verified custom domain not found")
    deployment = db.get(Deployment, domain.deployment_id)
    if deployment is None: raise HTTPException(status_code=404, detail="Deployment not found")
    return bootstrap(deployment.deployment_key, request, db, url, referrer, language, country, device, impressions, shown_this_session)


@public_router.post(
    "/deployments/{deployment_key}/start",
    response_model=ConversationState,
    name="deployment_start",
)
def deployment_start(
    deployment_key: str,
    payload: ConversationStart,
    db: Annotated[Session, Depends(get_db)],
) -> ConversationState:
    deployment, _, version = _public_deployment(deployment_key, db)
    _verify_eligibility_token(payload.deployment_token, deployment_key)
    reasons = _schedule_reasons(deployment, db)
    if reasons:
        raise HTTPException(status_code=403, detail=reasons)
    return _start(
        db,
        version,
        payload,
        debug=False,
        source=f"deployment:{deployment.mode}",
        metadata={**payload.metadata, "deployment_key": deployment.deployment_key, "environment": deployment.environment},
    )


@public_router.get("/deployments/{deployment_key}/embed.js")
def embed_script(deployment_key: str, request: Request, db: Annotated[Session, Depends(get_db)]) -> Response:
    deployment, bot, _ = _public_deployment(deployment_key, db)
    frontend_base = str(deployment.config.get("frontend_url") or "http://localhost:3000").rstrip("/")
    chat_url = f"{frontend_base}/chat/{bot.slug}?deployment={deployment.deployment_key}"
    api_base = str(request.base_url).rstrip("/")
    color = str(deployment.config.get("primary_color") or "#6d5dfc")
    title = str(deployment.config.get("launcher_label") or "Chat")
    mode = deployment.mode
    script = f"""(() => {{
  const current = document.currentScript;
  const key = {json.dumps(deployment.deployment_key)};
  const query = new URLSearchParams({{url: location.href, referrer: document.referrer, language: navigator.language}});
  fetch({json.dumps(api_base + '/api/public/deployments/' + deployment.deployment_key + '/bootstrap')} + '?' + query)
    .then(response => response.ok ? response.json() : Promise.reject(new Error('bootstrap failed')))
    .then(data => {{
      if (!data.eligible) return;
      const iframe = document.createElement('iframe');
      iframe.src = {json.dumps(chat_url)} + '&eligibility=' + encodeURIComponent(data.eligibility_token);
      iframe.title = {json.dumps(title)};
      iframe.style.cssText = 'border:0;width:100%;height:100%;background:#fff';
      if ({json.dumps(mode)} === 'embed') {{
        const mount = document.querySelector(current?.dataset.target || '') || current?.parentElement;
        const frame = document.createElement('div'); frame.style.cssText='width:100%;height:620px;max-width:520px'; frame.appendChild(iframe); mount?.appendChild(frame); return;
      }}
      const panel = document.createElement('div'); panel.style.cssText='display:none;position:fixed;right:24px;bottom:88px;width:min(390px,calc(100vw - 32px));height:min(620px,calc(100vh - 120px));z-index:2147483646;border-radius:18px;overflow:hidden;box-shadow:0 20px 70px rgba(0,0,0,.28)'; panel.appendChild(iframe);
      const button = document.createElement('button'); button.type='button'; button.textContent={json.dumps(title)}; button.setAttribute('aria-label', {json.dumps(title)}); button.style.cssText='position:fixed;right:24px;bottom:24px;z-index:2147483647;border:0;border-radius:999px;padding:14px 20px;color:#fff;font:600 15px system-ui;background:{color};box-shadow:0 12px 32px rgba(0,0,0,.22);cursor:pointer';
      button.addEventListener('click', () => {{ panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; }});
      document.body.append(panel, button);
    }}).catch(() => undefined);
}})();"""
    return Response(content=script, media_type="application/javascript", headers={"Cache-Control": "no-cache"})
