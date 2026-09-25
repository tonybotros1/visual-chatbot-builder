from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from app.config import get_settings
from app.engine.executor import EngineError, validate_answer
from app.models.bot import BotVersion
from app.models.conversation import Conversation
from app.models.integration import IntegrationConnection
from app.models.provider import AppointmentReservation, PaymentTransaction, StoredFile
from app.models.provider import OtpChallenge
from app.services.secret_vault import decrypt_secrets
from app.services.integrations import _ensure_public_destination


TOKEN_ALGORITHM = "HS256"


def current_provider_node(db: Session, conversation_id: UUID, node_id: str, expected_type: str) -> tuple[Conversation, dict[str, Any]]:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or conversation.status != "active" or conversation.current_node_id != node_id:
        raise EngineError("Provider action is not available for this conversation")
    version = db.get(BotVersion, conversation.bot_version_id)
    if version is None:
        raise EngineError("Conversation version is unavailable")
    node = next((item for item in version.flow_json.get("nodes", []) if item.get("id") == node_id), None)
    if node is None or node.get("type") != expected_type:
        raise EngineError(f"Current node is not a {expected_type} node")
    return conversation, node


def create_upload_token(payload: dict[str, Any]) -> str:
    data = {**payload, "purpose": "upload", "exp": datetime.now(UTC) + timedelta(minutes=15)}
    return jwt.encode(data, get_settings().secret_key, algorithm=TOKEN_ALGORITHM)


def decode_upload_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[TOKEN_ALGORITHM])
    except JWTError as exc:
        raise EngineError("Upload ticket is invalid or expired") from exc
    if payload.get("purpose") != "upload":
        raise EngineError("Upload ticket has the wrong purpose")
    return payload


def create_download_token(file_id: UUID) -> str:
    return jwt.encode({"sub": str(file_id), "purpose": "download", "exp": datetime.now(UTC) + timedelta(hours=1)}, get_settings().secret_key, algorithm=TOKEN_ALGORITHM)


def decode_download_token(token: str) -> UUID:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[TOKEN_ALGORITHM])
        if payload.get("purpose") != "download": raise ValueError
        return UUID(str(payload["sub"]))
    except (JWTError, KeyError, ValueError) as exc:
        raise EngineError("Download link is invalid or expired") from exc


def storage_path(storage_key: str) -> Path:
    root = Path(get_settings().upload_directory).resolve()
    root.mkdir(parents=True, exist_ok=True)
    path = (root / storage_key).resolve()
    if root not in path.parents:
        raise EngineError("Invalid storage key")
    return path


def scan_bytes(content: bytes) -> str:
    # Always rejects the standard antivirus test signature; production can layer ClamAV/object-store scanning.
    if b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE" in content or b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR" in content:
        return "infected"
    return "clean"


def safe_filename(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(value).name).strip("._")
    return cleaned[:180] or "upload.bin"


def store_file_content(db: Session, payload: dict[str, Any], storage_key: str, content: bytes) -> tuple[str, UUID | None]:
    provider = str(payload.get("storage_provider") or "local")
    if provider == "local":
        path = storage_path(storage_key); path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(content)
        return provider, None
    try: connection_id = UUID(str(payload.get("provider_connection_id")))
    except ValueError as exc: raise EngineError("Object storage connection is missing") from exc
    connection = db.get(IntegrationConnection, connection_id)
    if connection is None or connection.kind != "storage" or connection.status != "active": raise EngineError("Object storage connection is unavailable")
    if connection.config.get("provider", "s3") != "s3": raise EngineError("Only S3-compatible object storage is supported")
    _s3_request("PUT", storage_key, connection, content)
    return "s3", connection.id


def read_file_content(db: Session, item: StoredFile) -> bytes:
    if item.storage_provider == "local":
        path = storage_path(item.storage_key)
        if not path.is_file(): raise EngineError("Stored file is unavailable")
        return path.read_bytes()
    connection = db.get(IntegrationConnection, item.connection_id) if item.connection_id else None
    if connection is None or connection.status != "active": raise EngineError("Object storage connection is unavailable")
    return _s3_request("GET", item.storage_key, connection)


def delete_file_content(db: Session, item: StoredFile) -> None:
    if item.storage_provider == "local":
        storage_path(item.storage_key).unlink(missing_ok=True); return
    connection = db.get(IntegrationConnection, item.connection_id) if item.connection_id else None
    if connection and connection.status == "active": _s3_request("DELETE", item.storage_key, connection)


def _s3_request(method: str, key: str, connection: IntegrationConnection, body: bytes = b"") -> bytes:
    config = connection.config or {}
    secrets_data = decrypt_secrets(connection.encrypted_secrets)
    access_key, secret_key = secrets_data.get("access_key_id", ""), secrets_data.get("secret_access_key", "")
    if not access_key or not secret_key: raise EngineError("S3 access_key_id and secret_access_key are required")
    region, bucket = str(config.get("region") or "us-east-1"), str(config.get("bucket") or "")
    if not bucket: raise EngineError("S3 bucket is required")
    endpoint = str(config.get("endpoint") or f"https://s3.{region}.amazonaws.com").rstrip("/")
    _ensure_public_destination(endpoint)
    parsed = urlparse(endpoint)
    encoded_key = quote(key, safe="/~-._")
    path_style = bool(config.get("path_style", True))
    if path_style:
        canonical_uri = f"/{quote(bucket, safe='')}/{encoded_key}"; host = parsed.netloc; url = f"{endpoint}{canonical_uri}"
    else:
        host = f"{bucket}.{parsed.netloc}"; canonical_uri = f"/{encoded_key}"; url = f"{parsed.scheme}://{host}{canonical_uri}"
    now = datetime.now(UTC); amz_date = now.strftime("%Y%m%dT%H%M%SZ"); date_stamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(body).hexdigest()
    headers = {"host": host, "x-amz-content-sha256": payload_hash, "x-amz-date": amz_date}
    if secrets_data.get("session_token"): headers["x-amz-security-token"] = secrets_data["session_token"]
    signed_headers = ";".join(sorted(headers))
    canonical_headers = "".join(f"{name}:{headers[name]}\n" for name in sorted(headers))
    canonical_request = "\n".join([method, canonical_uri, "", canonical_headers, signed_headers, payload_hash])
    scope = f"{date_stamp}/{region}/s3/aws4_request"
    string_to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()])
    date_key = hmac.new(("AWS4" + secret_key).encode(), date_stamp.encode(), hashlib.sha256).digest()
    region_key = hmac.new(date_key, region.encode(), hashlib.sha256).digest()
    service_key = hmac.new(region_key, b"s3", hashlib.sha256).digest()
    signing_key = hmac.new(service_key, b"aws4_request", hashlib.sha256).digest()
    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()
    request_headers = {"Host": host, "X-Amz-Date": amz_date, "X-Amz-Content-Sha256": payload_hash, "Authorization": f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"}
    if secrets_data.get("session_token"): request_headers["X-Amz-Security-Token"] = secrets_data["session_token"]
    try:
        with urlopen(Request(url, method=method, headers=request_headers, data=body if method == "PUT" else None), timeout=30) as response: return response.read()
    except HTTPError as exc:
        detail = exc.read(500).decode("utf-8", errors="replace")
        raise EngineError(f"Object storage returned HTTP {exc.code}: {detail}") from exc
    except URLError as exc: raise EngineError(f"Object storage connection failed: {exc.reason}") from exc


def create_payment(db: Session, conversation_id: UUID, node_id: str) -> PaymentTransaction:
    _, node = current_provider_node(db, conversation_id, node_id, "payment")
    data = node.get("data", {})
    provider = str(data.get("provider") or "sandbox")
    connection = _provider_connection(db, data, provider) if provider not in {"sandbox", "cash"} else None
    amount_minor = round(float(data.get("amount") or 0) * 100)
    if amount_minor < 0:
        raise EngineError("Payment amount cannot be negative")
    item = PaymentTransaction(
        conversation_id=conversation_id, node_id=node_id, provider=provider,
        connection_id=connection.id if connection else None,
        provider_reference=f"{provider}_{uuid4().hex}", amount_minor=amount_minor,
        currency=str(data.get("currency") or "USD").upper()[:3], status="pending",
        details={"mode": "sandbox" if provider == "sandbox" else "provider"},
    )
    if provider == "cash": item.status = "paid"
    db.add(item); db.commit(); db.refresh(item)
    try:
        if provider == "stripe": _create_stripe_checkout(item, connection)
        elif provider == "paypal": _create_paypal_order(item, connection)
        elif provider not in {"sandbox", "cash"}: raise EngineError(f"Unsupported payment provider: {provider}")
        db.commit(); db.refresh(item); return item
    except Exception as exc:
        item.status = "failed"; item.details = {**(item.details or {}), "error": str(exc)[:500]}; db.commit()
        raise EngineError(f"Could not initialize {provider} payment: {exc}") from exc


def refresh_payment(db: Session, item: PaymentTransaction) -> PaymentTransaction:
    if item.status in {"paid", "failed", "cancelled"} or item.provider in {"sandbox", "cash"}: return item
    connection = db.get(IntegrationConnection, item.connection_id) if item.connection_id else None
    if connection is None or connection.status != "active": raise EngineError("Payment connection is unavailable")
    if item.provider == "stripe":
        secrets = decrypt_secrets(connection.encrypted_secrets)
        data = _json_request(f"https://api.stripe.com/v1/checkout/sessions/{item.provider_reference}", headers={"Authorization": f"Bearer {secrets.get('secret_key', '')}"})
        if data.get("payment_status") == "paid": item.status = "paid"
        elif data.get("status") == "expired": item.status = "cancelled"
    elif item.provider == "paypal":
        token, base = _paypal_token(connection)
        data = _json_request(f"{base}/v2/checkout/orders/{item.provider_reference}", headers={"Authorization": f"Bearer {token}"})
        remote_status = data.get("status")
        if remote_status == "APPROVED":
            data = _json_request(f"{base}/v2/checkout/orders/{item.provider_reference}/capture", method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, body=b"{}")
            remote_status = data.get("status")
        if remote_status == "COMPLETED": item.status = "paid"
        elif remote_status == "VOIDED": item.status = "cancelled"
    db.commit(); db.refresh(item); return item


def _provider_connection(db: Session, data: dict[str, Any], kind: str) -> IntegrationConnection:
    try: connection_id = UUID(str(data.get("provider_connection_id")))
    except ValueError as exc: raise EngineError(f"Select a {kind} integration connection") from exc
    connection = db.get(IntegrationConnection, connection_id)
    if connection is None or connection.status != "active" or connection.kind != kind:
        raise EngineError(f"The selected {kind} connection is unavailable")
    return connection


def _create_stripe_checkout(item: PaymentTransaction, connection: IntegrationConnection | None) -> None:
    if connection is None: raise EngineError("Stripe connection is missing")
    secrets = decrypt_secrets(connection.encrypted_secrets)
    secret_key = secrets.get("secret_key", "")
    if not secret_key: raise EngineError("Stripe secret_key is missing")
    config = connection.config or {}
    form = urlencode({
        "mode": "payment", "success_url": str(config.get("success_url") or "https://example.com/payment/success"),
        "cancel_url": str(config.get("cancel_url") or "https://example.com/payment/cancel"),
        "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": item.currency.lower(),
        "line_items[0][price_data][unit_amount]": str(item.amount_minor),
        "line_items[0][price_data][product_data][name]": str(config.get("product_name") or "Chatbot payment"),
        "metadata[payment_id]": str(item.id),
    }).encode()
    data = _json_request("https://api.stripe.com/v1/checkout/sessions", method="POST", headers={"Authorization": f"Bearer {secret_key}", "Content-Type": "application/x-www-form-urlencoded"}, body=form)
    if not data.get("id") or not data.get("url"): raise EngineError("Stripe did not return a checkout session")
    item.provider_reference = str(data["id"]); item.details = {**(item.details or {}), "action_url": data["url"]}


def _paypal_token(connection: IntegrationConnection) -> tuple[str, str]:
    secrets = decrypt_secrets(connection.encrypted_secrets)
    client_id, client_secret = secrets.get("client_id", ""), secrets.get("client_secret", "")
    if not client_id or not client_secret: raise EngineError("PayPal client_id and client_secret are required")
    base = "https://api-m.sandbox.paypal.com" if connection.config.get("environment", "sandbox") == "sandbox" else "https://api-m.paypal.com"
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    data = _json_request(f"{base}/v1/oauth2/token", method="POST", headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"}, body=b"grant_type=client_credentials")
    if not data.get("access_token"): raise EngineError("PayPal authentication failed")
    return str(data["access_token"]), base


def _create_paypal_order(item: PaymentTransaction, connection: IntegrationConnection | None) -> None:
    if connection is None: raise EngineError("PayPal connection is missing")
    token, base = _paypal_token(connection)
    config = connection.config or {}
    payload = {"intent": "CAPTURE", "purchase_units": [{"reference_id": str(item.id), "amount": {"currency_code": item.currency, "value": f"{item.amount_minor / 100:.2f}"}}], "application_context": {"return_url": config.get("return_url", "https://example.com/payment/success"), "cancel_url": config.get("cancel_url", "https://example.com/payment/cancel")}}
    data = _json_request(f"{base}/v2/checkout/orders", method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, body=json.dumps(payload).encode())
    action = next((link.get("href") for link in data.get("links", []) if link.get("rel") == "approve"), None)
    if not data.get("id") or not action: raise EngineError("PayPal did not return an approval link")
    item.provider_reference = str(data["id"]); item.details = {**(item.details or {}), "action_url": action}


def _json_request(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, body: bytes | None = None) -> dict[str, Any]:
    request = Request(url, method=method, headers={"User-Agent": "VisualChatbotBuilder/2", **(headers or {})}, data=body)
    try:
        with urlopen(request, timeout=15) as response: return json.loads(response.read())
    except HTTPError as exc:
        detail = exc.read(500).decode("utf-8", errors="replace")
        raise EngineError(f"Provider returned HTTP {exc.code}: {detail}") from exc
    except URLError as exc: raise EngineError(f"Provider connection failed: {exc.reason}") from exc


def appointment_slots(db: Session, conversation_id: UUID, node_id: str) -> list[tuple[datetime, datetime, str]]:
    _, node = current_provider_node(db, conversation_id, node_id, "appointment")
    data = node.get("data", {})
    timezone_name = str(data.get("timezone") or "UTC")
    try: timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc: raise EngineError("Appointment timezone is invalid") from exc
    duration = max(5, min(480, int(data.get("duration_minutes") or 30)))
    try:
        opening_hour = int(9 if data.get("opening_hour") is None else data["opening_hour"])
        closing_hour = int(17 if data.get("closing_hour") is None else data["closing_hour"])
    except (TypeError, ValueError) as exc:
        raise EngineError("Appointment opening and closing hours must be whole numbers") from exc
    if not 0 <= opening_hour <= 23 or not 1 <= closing_hour <= 24 or opening_hour >= closing_hour:
        raise EngineError("Appointment hours must define a valid daily window")
    now = datetime.now(timezone)
    provider = str(data.get("provider") or "local")
    connection = _provider_connection(db, data, provider) if provider != "local" else None
    range_end = now + timedelta(days=15)
    remote_busy = _calendar_busy(connection, now.astimezone(UTC), range_end.astimezone(UTC)) if connection else []
    slots: list[tuple[datetime, datetime, str]] = []
    for day_offset in range(1, 15):
        day = (now + timedelta(days=day_offset)).date()
        if day.weekday() >= 5: continue
        midnight = datetime(day.year, day.month, day.day, tzinfo=timezone)
        cursor = midnight + timedelta(hours=opening_hour)
        end_of_day = midnight + timedelta(hours=closing_hour)
        while cursor + timedelta(minutes=duration) <= end_of_day and len(slots) < 40:
            end = cursor + timedelta(minutes=duration)
            conflict = db.scalar(select(AppointmentReservation.id).where(
                AppointmentReservation.status == "confirmed",
                AppointmentReservation.starts_at < end.astimezone(UTC),
                AppointmentReservation.ends_at > cursor.astimezone(UTC),
            ))
            overlaps_remote = any(busy_start < end.astimezone(UTC) and busy_end > cursor.astimezone(UTC) for busy_start, busy_end in remote_busy)
            if conflict is None and not overlaps_remote: slots.append((cursor, end, timezone_name))
            cursor = end
    return slots


def book_appointment(db: Session, conversation_id: UUID, node_id: str, starts_at: datetime, metadata: dict[str, Any]) -> AppointmentReservation:
    _, node = current_provider_node(db, conversation_id, node_id, "appointment")
    data = node.get("data", {})
    timezone_name = str(data.get("timezone") or "UTC")
    duration = max(5, min(480, int(data.get("duration_minutes") or 30)))
    start = starts_at.replace(tzinfo=UTC) if starts_at.tzinfo is None else starts_at.astimezone(UTC)
    end = start + timedelta(minutes=duration)
    conflict = db.scalar(select(AppointmentReservation.id).where(
        AppointmentReservation.status == "confirmed",
        AppointmentReservation.starts_at < end,
        AppointmentReservation.ends_at > start,
    ))
    if conflict is not None: raise EngineError("This appointment slot was just booked; choose another")
    provider = str(data.get("provider") or "local")
    connection = _provider_connection(db, data, provider) if provider != "local" else None
    remote_reference = _create_calendar_event(connection, start, end, timezone_name, data, metadata) if connection else "local"
    item = AppointmentReservation(
        conversation_id=conversation_id, node_id=node_id, provider=provider,
        connection_id=connection.id if connection else None,
        calendar_reference=remote_reference, starts_at=start,
        ends_at=end, timezone=timezone_name, status="confirmed", details=metadata,
    )
    db.add(item); db.commit(); db.refresh(item); return item


def _calendar_busy(connection: IntegrationConnection, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    secrets = decrypt_secrets(connection.encrypted_secrets)
    token = secrets.get("access_token", "")
    if not token: raise EngineError(f"{connection.kind} access_token is missing")
    calendar_id = str(connection.config.get("calendar_id") or "primary")
    if connection.kind == "google_calendar":
        payload = {"timeMin": start.isoformat(), "timeMax": end.isoformat(), "items": [{"id": calendar_id}]}
        data = _json_request("https://www.googleapis.com/calendar/v3/freeBusy", method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, body=json.dumps(payload).encode())
        entries = data.get("calendars", {}).get(calendar_id, {}).get("busy", [])
        return [(_parse_remote_time(item["start"]), _parse_remote_time(item["end"])) for item in entries]
    if connection.kind == "microsoft_calendar":
        query = urlencode({"startDateTime": start.isoformat(), "endDateTime": end.isoformat(), "$select": "start,end"})
        data = _json_request(f"https://graph.microsoft.com/v1.0/me/calendars/{calendar_id}/calendarView?{query}", headers={"Authorization": f"Bearer {token}"})
        return [(_parse_remote_time(item["start"]["dateTime"]), _parse_remote_time(item["end"]["dateTime"])) for item in data.get("value", [])]
    raise EngineError(f"Unsupported calendar provider: {connection.kind}")


def _create_calendar_event(connection: IntegrationConnection, start: datetime, end: datetime, timezone_name: str, node_data: dict[str, Any], metadata: dict[str, Any]) -> str:
    secrets = decrypt_secrets(connection.encrypted_secrets)
    token = secrets.get("access_token", "")
    if not token: raise EngineError(f"{connection.kind} access_token is missing")
    calendar_id = str(connection.config.get("calendar_id") or "primary")
    title = str(node_data.get("event_title") or connection.config.get("event_title") or "Chatbot appointment")
    if connection.kind == "google_calendar":
        payload = {"summary": title, "description": json.dumps(metadata, ensure_ascii=False), "start": {"dateTime": start.isoformat(), "timeZone": timezone_name}, "end": {"dateTime": end.isoformat(), "timeZone": timezone_name}}
        data = _json_request(f"https://www.googleapis.com/calendar/v3/calendars/{calendar_id}/events", method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, body=json.dumps(payload).encode())
    elif connection.kind == "microsoft_calendar":
        payload = {"subject": title, "body": {"contentType": "text", "content": json.dumps(metadata, ensure_ascii=False)}, "start": {"dateTime": start.isoformat(), "timeZone": timezone_name}, "end": {"dateTime": end.isoformat(), "timeZone": timezone_name}}
        data = _json_request(f"https://graph.microsoft.com/v1.0/me/calendars/{calendar_id}/events", method="POST", headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, body=json.dumps(payload).encode())
    else: raise EngineError(f"Unsupported calendar provider: {connection.kind}")
    if not data.get("id"): raise EngineError("Calendar provider did not return an event ID")
    return str(data["id"])


def _parse_remote_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def send_otp(db: Session, conversation_id: UUID, node_id: str, phone: str) -> tuple[OtpChallenge, str | None]:
    conversation, node = current_provider_node(db, conversation_id, node_id, "phoneInput")
    data = node.get("data", {})
    if not data.get("otp_required"): raise EngineError("OTP is not enabled for this phone question")
    normalized_phone = validate_answer(node, phone)
    connection = _provider_connection(db, data, "sms")
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = OtpChallenge(
        conversation_id=conversation_id, node_id=node_id, connection_id=connection.id,
        phone=normalized_phone, code_hash=_otp_hash(code), expires_at=datetime.now(UTC) + timedelta(minutes=10),
    )
    db.add(challenge); db.commit(); db.refresh(challenge)
    sandbox = connection.config.get("mode") == "sandbox"
    if sandbox:
        if conversation.source != "preview": raise EngineError("Sandbox OTP is only available in authenticated preview")
        return challenge, code
    url = str(connection.config.get("url") or "")
    _ensure_public_destination(url)
    credentials = decrypt_secrets(connection.encrypted_secrets)
    body = json.dumps({"to": normalized_phone, "message": str(connection.config.get("message_template") or "Your verification code is {code}").replace("{code}", code), "sender": connection.config.get("sender")}).encode()
    headers = {"Content-Type": "application/json", "User-Agent": "VisualChatbotBuilder/2"}
    if credentials.get("token"): headers["Authorization"] = f"Bearer {credentials['token']}"
    try:
        with urlopen(Request(url, method="POST", headers=headers, data=body), timeout=10) as response:
            if response.status >= 300: raise EngineError(f"SMS provider returned HTTP {response.status}")
    except HTTPError as exc: raise EngineError(f"SMS provider returned HTTP {exc.code}") from exc
    except URLError as exc: raise EngineError(f"SMS provider connection failed: {exc.reason}") from exc
    return challenge, None


def verify_otp(db: Session, challenge_id: UUID, code: str) -> OtpChallenge:
    challenge = db.get(OtpChallenge, challenge_id)
    if challenge is None: raise EngineError("Verification challenge not found")
    now = datetime.now(UTC)
    expires_at = challenge.expires_at.replace(tzinfo=UTC) if challenge.expires_at.tzinfo is None else challenge.expires_at
    if expires_at < now: raise EngineError("Verification code has expired")
    if challenge.attempts >= 5: raise EngineError("Too many verification attempts")
    challenge.attempts += 1
    if not hmac.compare_digest(challenge.code_hash, _otp_hash(code)):
        db.commit(); raise EngineError("Verification code is incorrect")
    challenge.verified = True; db.commit(); db.refresh(challenge); return challenge


def _otp_hash(code: str) -> str:
    return hmac.new(get_settings().secret_key.encode(), code.encode(), hashlib.sha256).hexdigest()


def provider_answer_value(db: Session, conversation: Conversation, node_id: str, value: Any) -> Any:
    version = db.get(BotVersion, conversation.bot_version_id)
    node = next((item for item in (version.flow_json.get("nodes", []) if version else []) if item.get("id") == node_id), None)
    if node is None: raise EngineError("Provider node is unavailable")
    if value in (None, "", []) and node.get("data", {}).get("required", True) is False:
        return value
    if node.get("type") == "phoneInput" and node.get("data", {}).get("otp_required"):
        challenge_id = value.get("challenge_id") if isinstance(value, dict) else None
        try: parsed = UUID(str(challenge_id))
        except ValueError as exc: raise EngineError("Phone verification is required") from exc
        challenge = db.scalar(select(OtpChallenge).where(OtpChallenge.id == parsed, OtpChallenge.conversation_id == conversation.id, OtpChallenge.node_id == node_id, OtpChallenge.verified.is_(True)))
        if challenge is None: raise EngineError("Phone verification is incomplete")
        return challenge.phone
    if node.get("type") == "fileUpload":
        validate_answer(node, value)
        files = value if isinstance(value, list) else [value]
        ids = []
        try: ids = [UUID(str(item.get("file_id"))) for item in files]
        except (ValueError, TypeError, AttributeError) as exc: raise EngineError("Uploaded file reference is invalid") from exc
        matches = list(db.scalars(select(StoredFile).where(StoredFile.conversation_id == conversation.id, StoredFile.node_id == node_id, StoredFile.id.in_(ids), StoredFile.scan_status == "clean")))
        if len(matches) != len(set(ids)): raise EngineError("Every uploaded file must be clean and belong to this conversation")
    elif node.get("type") == "payment":
        payment_id = value.get("payment_id") if isinstance(value, dict) else None
        try: parsed = UUID(str(payment_id))
        except ValueError as exc: raise EngineError("Payment confirmation is invalid") from exc
        item = db.scalar(select(PaymentTransaction).where(PaymentTransaction.id == parsed, PaymentTransaction.conversation_id == conversation.id, PaymentTransaction.node_id == node_id, PaymentTransaction.status == "paid"))
        if item is None: raise EngineError("Payment has not been verified")
    elif node.get("type") == "appointment":
        appointment_id = value.get("appointment_id") if isinstance(value, dict) else None
        try: parsed = UUID(str(appointment_id))
        except ValueError as exc: raise EngineError("Appointment confirmation is invalid") from exc
        item = db.scalar(select(AppointmentReservation).where(AppointmentReservation.id == parsed, AppointmentReservation.conversation_id == conversation.id, AppointmentReservation.node_id == node_id, AppointmentReservation.status == "confirmed"))
        if item is None: raise EngineError("Appointment has not been confirmed")
    return value
