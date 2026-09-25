from __future__ import annotations

import hashlib
import hmac
import json
import smtplib
import socket
import ssl
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from ipaddress import ip_address
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.bot import Bot
from app.models.conversation import Conversation
from app.models.integration import BotEventSubscription, IntegrationConnection, IntegrationDelivery
from app.services.secret_vault import decrypt_secrets


RETRY_DELAYS = [60, 300, 1800, 7200, 43200]


def validate_webhook_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Webhook URLs must use HTTPS")
    hostname = parsed.hostname.lower()
    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".local"):
        raise ValueError("Private webhook hosts are not allowed")
    try:
        if ip_address(hostname).is_private or ip_address(hostname).is_loopback:
            raise ValueError("Private webhook hosts are not allowed")
    except ValueError as exc:
        if "Private webhook" in str(exc):
            raise
    return value


def _ensure_public_destination(url: str) -> None:
    hostname = urlparse(validate_webhook_url(url)).hostname
    if not hostname:
        raise ValueError("Webhook host is missing")
    for item in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM):
        address = ip_address(item[4][0])
        if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
            raise ValueError("Webhook resolved to a private network")


def enqueue_event(db: Session, event: str, conversation: Conversation) -> int:
    subscriptions = list(
        db.scalars(
            select(BotEventSubscription)
            .join(IntegrationConnection, BotEventSubscription.connection_id == IntegrationConnection.id)
            .where(
                BotEventSubscription.bot_id == conversation.bot_id,
                BotEventSubscription.event == event,
                BotEventSubscription.status == "active",
                IntegrationConnection.status == "active",
            )
        )
    )
    payload = {
        "event": event,
        "occurred_at": datetime.now(UTC).isoformat(),
        "bot_id": str(conversation.bot_id),
        "conversation": {
            "id": str(conversation.id),
            "session_id": conversation.session_id,
            "status": conversation.status,
            "source": conversation.source,
            "variables": conversation.variables or {},
            "metadata": conversation.context_data or {},
            "tags": conversation.tags or [],
        },
    }
    for subscription in subscriptions:
        db.add(
            IntegrationDelivery(
                bot_id=conversation.bot_id,
                conversation_id=conversation.id,
                connection_id=subscription.connection_id,
                event=event,
                payload=payload,
                status="pending",
                next_attempt_at=datetime.now(UTC),
            )
        )
    if subscriptions:
        db.commit()
    return len(subscriptions)


def pending_deliveries(db: Session, limit: int = 20) -> list[IntegrationDelivery]:
    now = datetime.now(UTC)
    return list(
        db.scalars(
            select(IntegrationDelivery)
            .where(
                IntegrationDelivery.status.in_(["pending", "retrying"]),
                or_(IntegrationDelivery.next_attempt_at.is_(None), IntegrationDelivery.next_attempt_at <= now),
            )
            .order_by(IntegrationDelivery.created_at)
            .limit(limit)
        )
    )


def deliver(db: Session, delivery: IntegrationDelivery) -> None:
    connection = db.get(IntegrationConnection, delivery.connection_id)
    if connection is None or connection.status != "active":
        delivery.status = "failed"
        delivery.last_error = "Integration connection is disabled or missing"
        db.commit()
        return
    delivery.attempt_count += 1
    try:
        if connection.kind == "email":
            _deliver_email(connection, delivery.payload)
            response_code = 250
        elif connection.kind in {"webhook", "slack", "sms"}:
            response_code = _deliver_http(connection, delivery.payload)
        else:
            raise ValueError(f"{connection.kind} is a provider connection, not an event delivery channel")
        delivery.status = "delivered"
        delivery.response_code = response_code
        delivery.delivered_at = datetime.now(UTC)
        delivery.next_attempt_at = None
        delivery.last_error = ""
    except Exception as exc:  # Worker boundary: persist sanitized failure and retry.
        delivery.last_error = str(exc)[:1000]
        if delivery.attempt_count >= len(RETRY_DELAYS):
            delivery.status = "failed"
            delivery.next_attempt_at = None
        else:
            delivery.status = "retrying"
            delivery.next_attempt_at = datetime.now(UTC) + timedelta(seconds=RETRY_DELAYS[delivery.attempt_count - 1])
    db.commit()


def _deliver_http(connection: IntegrationConnection, payload: dict[str, Any]) -> int:
    url = str(connection.config.get("url") or "")
    _ensure_public_destination(url)
    secrets = decrypt_secrets(connection.encrypted_secrets)
    body_payload = payload
    if connection.kind == "slack":
        body_payload = {"text": connection.config.get("message") or f"Chatbot event: {payload.get('event')}", "event": payload}
    body = json.dumps(body_payload, separators=(",", ":"), default=str).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": "VisualChatbotBuilder/2"}
    secret = secrets.get("signing_secret") or secrets.get("token")
    if secret:
        headers["X-VCB-Signature"] = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    request = Request(url, data=body, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=10, context=ssl.create_default_context()) as response:
            code = int(response.status)
    except HTTPError as exc:
        raise RuntimeError(f"Provider returned HTTP {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Provider connection failed: {exc.reason}") from exc
    if code >= 300:
        raise RuntimeError(f"Provider returned HTTP {code}")
    return code


def _deliver_email(connection: IntegrationConnection, payload: dict[str, Any]) -> None:
    config = connection.config
    secrets = decrypt_secrets(connection.encrypted_secrets)
    message = EmailMessage()
    message["Subject"] = str(config.get("subject") or f"Chatbot event: {payload.get('event')}")
    message["From"] = str(config.get("from_email") or secrets.get("username") or "")
    message["To"] = str(config.get("to_email") or "")
    message.set_content(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    host, port = str(config.get("host") or ""), int(config.get("port") or 587)
    with smtplib.SMTP(host, port, timeout=10) as client:
        if config.get("starttls", True):
            client.starttls(context=ssl.create_default_context())
        if secrets.get("username"):
            client.login(secrets["username"], secrets.get("password", ""))
        client.send_message(message)
