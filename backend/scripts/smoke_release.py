"""End-to-end release smoke test for the complete V2/V2B local stack."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

from sqlalchemy import delete, select

from app.config import get_settings
from app.database.session import SessionLocal
from app.models.bot import Bot
from app.models.deployment import TargetSegment
from app.models.integration import IntegrationConnection
from app.models.provider import StoredFile
from app.models.user import User
from app.services.providers import delete_file_content


API_URL = "http://127.0.0.1:8000/api"
# Smoke runs sign in as the platform super admin configured for the stack (see .env.example).
SMOKE_EMAIL = os.environ.get("SMOKE_EMAIL") or get_settings().super_admin_email
SMOKE_PASSWORD = os.environ.get("SMOKE_PASSWORD") or get_settings().super_admin_password


def request(
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    token: str | None = None,
    body: bytes | None = None,
    content_type: str | None = None,
    expected_status: int | None = None,
    binary: bool = False,
) -> Any:
    url = path if path.startswith("http") else f"{API_URL}{path}"
    headers = {"Accept": "application/octet-stream" if binary else "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    elif content_type:
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with urlopen(Request(url, data=body, headers=headers, method=method), timeout=20) as response:
            content = response.read()
            if expected_status is not None:
                assert response.status == expected_status, (response.status, content)
            if binary:
                return content
            return json.loads(content) if content else None
    except HTTPError as exc:
        content = exc.read()
        if expected_status == exc.code:
            return json.loads(content) if content else None
        raise AssertionError(f"{method} {url} returned {exc.code}: {content.decode(errors='replace')}") from exc


def answer(conversation_id: str, node_id: str, value: Any) -> dict[str, Any]:
    return request(
        f"/conversations/{conversation_id}/answer",
        method="POST",
        payload={"node_id": node_id, "value": value},
    )


def main() -> None:
    owner = request(
        "/auth/login",
        method="POST",
        payload={"email": SMOKE_EMAIL, "password": SMOKE_PASSWORD},
    )
    token = owner["access_token"]
    suffix = uuid4().hex[:10]
    bot_id: str | None = None
    connection_id: str | None = None
    segment_id: str | None = None
    member_id: str | None = None
    stored_file_id: str | None = None
    try:
        bot = request(
            "/bots",
            method="POST",
            payload={"name": f"Release verification {suffix}", "description": "Temporary end-to-end release test"},
            token=token,
        )
        bot_id = bot["id"]

        connection = request(
            "/integrations",
            method="POST",
            payload={"kind": "sms", "name": f"Release sandbox SMS {suffix}", "config": {"mode": "sandbox"}, "secrets": {}},
            token=token,
        )
        connection_id = connection["id"]
        assert connection["has_secrets"] is False

        flow = {
            "nodes": [
                {"id": "start", "type": "start", "position": {"x": 0, "y": 0}, "data": {"label": "Start"}},
                {"id": "file", "type": "fileUpload", "position": {"x": 220, "y": 0}, "data": {"label": "Upload proof", "variable": "proof", "required": True, "storage_provider": "local", "file_types": ["text/plain"], "max_file_size_mb": 1, "max_files": 1}},
                {"id": "payment", "type": "payment", "position": {"x": 440, "y": 0}, "data": {"label": "Pay", "variable": "payment", "required": True, "provider": "sandbox", "amount": 12.34, "currency": "USD"}},
                {"id": "appointment", "type": "appointment", "position": {"x": 660, "y": 0}, "data": {"label": "Book", "variable": "appointment", "required": True, "provider": "local", "duration_minutes": 30, "timezone": "UTC", "opening_hour": 0, "closing_hour": 24}},
                {"id": "phone", "type": "phoneInput", "position": {"x": 880, "y": 0}, "data": {"label": "Verify phone", "variable": "phone", "required": True, "otp_required": True, "provider_connection_id": connection_id}},
                {"id": "thanks", "type": "thankYou", "position": {"x": 1100, "y": 0}, "data": {"label": "Done", "cta_label": "Home", "cta_url": "https://example.com"}},
            ],
            "edges": [
                {"id": "e1", "source": "start", "target": "file"},
                {"id": "e2", "source": "file", "target": "payment"},
                {"id": "e3", "source": "payment", "target": "appointment"},
                {"id": "e4", "source": "appointment", "target": "phone"},
                {"id": "e5", "source": "phone", "target": "thanks"},
            ],
            "variables": [],
        }
        request(f"/bots/{bot_id}/flow", method="PUT", payload=flow, token=token)
        validation = request(f"/bots/{bot_id}/validate", method="POST", token=token)
        assert validation["valid"] is True, validation

        locale = request(
            f"/bots/{bot_id}/locales",
            method="POST",
            payload={"locale": "ar", "name": "Arabic", "direction": "rtl", "translations": {"file.label": "ارفع ملفا", "thanks.label": "تم"}, "is_default": False},
            token=token,
        )
        assert locale["direction"] == "rtl"

        state = request(
            f"/bots/{bot_id}/preview/start",
            method="POST",
            payload={"session_id": f"release-{suffix}", "locale": "ar"},
            token=token,
        )
        assert state["direction"] == "rtl" and state["next_node"]["data"]["label"] == "ارفع ملفا"
        conversation_id = state["conversation_id"]

        content = b"Visual Chatbot Builder release verification"
        ticket = request(
            "/public/provider-actions/files/initiate",
            method="POST",
            payload={"conversation_id": conversation_id, "node_id": "file", "name": "release.txt", "type": "text/plain", "size": len(content)},
        )
        uploaded = request(ticket["upload_url"], method="PUT", body=content, content_type="text/plain")
        stored_file_id = uploaded["file_id"]
        assert request(uploaded["download_url"], binary=True) == content
        state = answer(conversation_id, "file", [uploaded])

        payment = request("/public/provider-actions/payments", method="POST", payload={"conversation_id": conversation_id, "node_id": "payment"})
        payment = request(payment["action_url"], method="POST")
        assert payment["status"] == "paid"
        state = answer(conversation_id, "payment", payment)

        slots = request("/public/provider-actions/appointments/slots", method="POST", payload={"conversation_id": conversation_id, "node_id": "appointment"})
        assert slots
        appointment = request("/public/provider-actions/appointments/book", method="POST", payload={"conversation_id": conversation_id, "node_id": "appointment", "starts_at": slots[0]["starts_at"], "metadata": {"source": "release-smoke"}})
        state = answer(conversation_id, "appointment", appointment)

        otp = request("/public/provider-actions/otp/send", method="POST", payload={"conversation_id": conversation_id, "node_id": "phone", "phone": "+971501234567"})
        assert otp["debug_code"]
        verified = request("/public/provider-actions/otp/verify", method="POST", payload={"challenge_id": otp["challenge_id"], "code": otp["debug_code"]})
        state = answer(conversation_id, "phone", {"challenge_id": verified["challenge_id"]})
        assert state["status"] == "completed" and state["variables"]["phone"] == "+971501234567"

        published = request(f"/bots/{bot_id}/publish", method="POST", token=token)
        assert published["version"]["version_number"] == 1

        segment = request(
            "/target-segments",
            method="POST",
            payload={"name": f"Pricing visitors {suffix}", "rules": {"match": {"combinator": "all", "conditions": [{"field": "url", "operator": "contains", "value": "/pricing"}]}}},
            token=token,
        )
        segment_id = segment["id"]
        deployment = request(
            f"/bots/{bot_id}/deployments",
            method="POST",
            payload={"name": "Release widget", "mode": "widget", "environment": "production", "target_segment_id": segment_id, "config": {"frontend_url": "http://localhost:3000", "launcher_label": "Release chat"}, "rules": {}},
            token=token,
        )
        key = deployment["deployment_key"]
        miss = request(f"/public/deployments/{key}/bootstrap?{urlencode({'url': 'https://example.com/about'})}")
        assert miss["eligible"] is False and miss["eligibility_token"] is None
        hit = request(f"/public/deployments/{key}/bootstrap?{urlencode({'url': 'https://example.com/pricing'})}")
        assert hit["eligible"] is True and hit["eligibility_token"]
        request(f"/public/deployments/{key}/start", method="POST", payload={}, expected_status=403)
        deployed = request(f"/public/deployments/{key}/start", method="POST", payload={"locale": "ar", "deployment_token": hit["eligibility_token"]})
        assert deployed["source"] if "source" in deployed else deployed["next_node"]["id"] == "file"

        sdk = request("/public/sdk/v1.js", binary=True).decode()
        assert "VisualChatbot" in sdk and "eligibility_token" in sdk

        domain = request(f"/deployments/{deployment['id']}/domains", method="POST", payload={"hostname": f"release-{suffix}.example.com"}, token=token)
        assert domain["status"] == "pending"
        request(f"/domains/{domain['id']}", method="DELETE", token=token, expected_status=204)

        updated = request(f"/conversations/{conversation_id}", method="PATCH", payload={"status": "qualified", "tags": ["release", "verified"], "note": "Release smoke test"}, token=token)
        assert updated["status"] == "qualified" and updated["tags"] == ["release", "verified"]
        workbook = request(f"/bots/{bot_id}/responses/export?format=xlsx", token=token, binary=True)
        assert workbook.startswith(b"PK")
        analytics = request(f"/bots/{bot_id}/analytics", token=token)
        assert analytics["conversations"] >= 2

        member_email = f"release-{suffix}@example.com"
        member = request("/auth/register", method="POST", payload={"name": "Release Viewer", "email": member_email, "password": "release-pass-123"})
        member_id = member["user"]["id"]
        collaborator = request(f"/bots/{bot_id}/collaborators", method="POST", payload={"email": member_email, "role": "viewer"}, token=token)
        request(f"/bots/{bot_id}", token=member["access_token"])
        # A viewer can see the bot, so a forbidden edit is a 403 (not a 404 that would hide its existence).
        request(f"/bots/{bot_id}/flow", method="PUT", payload=flow, token=member["access_token"], expected_status=403)
        audit = request(f"/bots/{bot_id}/audit-log", token=token)
        assert any(item["action"] == "collaborator.upserted" for item in audit)
        request(f"/bots/{bot_id}/collaborators/{collaborator['id']}", method="DELETE", token=token, expected_status=204)

        print(json.dumps({
            "status": "passed",
            "provider_flow": ["local_file", "sandbox_payment", "local_appointment", "sandbox_otp"],
            "localization": {"locale": state["locale"], "direction": state["direction"]},
            "deployment_targeting": {"non_match": miss["eligible"], "match": hit["eligible"], "direct_start_status": 403, "signed_start": deployed["status"]},
            "sdk": True,
            "custom_domain_lifecycle": True,
            "response_ops": {"status": updated["status"], "xlsx": True, "analytics_conversations": analytics["conversations"]},
            "team_permissions": True,
        }, indent=2))
    finally:
        with SessionLocal() as session:
            if stored_file_id:
                stored = session.get(StoredFile, UUID(stored_file_id))
                if stored:
                    try:
                        delete_file_content(session, stored)
                    except OSError:
                        pass
            if bot_id:
                bot = session.get(Bot, UUID(bot_id))
                if bot:
                    session.delete(bot)
                    session.flush()
            if segment_id:
                session.execute(delete(TargetSegment).where(TargetSegment.id == UUID(segment_id)))
            if connection_id:
                session.execute(delete(IntegrationConnection).where(IntegrationConnection.id == UUID(connection_id)))
            if member_id:
                session.execute(delete(User).where(User.id == UUID(member_id)))
            session.commit()


if __name__ == "__main__":
    main()
