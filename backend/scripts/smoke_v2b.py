"""Exercise V2B Phase 1A question nodes through preview and publication."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

from sqlalchemy import delete

from app.config import get_settings
from app.database.session import SessionLocal
from app.models.bot import Bot


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
) -> Any:
    headers = {"Accept": "application/json"}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        with urlopen(
            Request(f"{API_URL}{path}", data=body, headers=headers, method=method),
            timeout=10,
        ) as response:
            content = response.read()
            return json.loads(content) if content else None
    except HTTPError as exc:
        detail = exc.read().decode()
        raise AssertionError(f"{method} {path} returned {exc.code}: {detail}") from exc


def complete_conversation(state: dict[str, Any]) -> dict[str, Any]:
    answers = [
        ("channel", "Mobile"),
        ("effort", 8),
        ("rating", 5),
        ("date", "2026-09-19"),
    ]
    for node_id, value in answers:
        assert state["next_node"]["id"] == node_id, state
        state = request(
            f"/conversations/{state['conversation_id']}/answer",
            method="POST",
            payload={"node_id": node_id, "value": value},
        )
    return state


def main() -> None:
    token = request(
        "/auth/login",
        method="POST",
        payload={"email": SMOKE_EMAIL, "password": SMOKE_PASSWORD},
    )["access_token"]
    test_bot_id: str | None = None
    try:
        created = request(
            "/bots",
            method="POST",
            payload={"name": f"V2B smoke {uuid4().hex[:8]}", "description": "Temporary V2B Phase 1A QA bot"},
            token=token,
        )
        test_bot_id = created["id"]
        flow = {
            "nodes": [
                {"id": "start", "type": "start", "position": {"x": 0, "y": 0}, "data": {"label": "Start"}},
                {
                    "id": "channel",
                    "type": "searchableList",
                    "position": {"x": 250, "y": 0},
                    "data": {
                        "label": "Preferred channel",
                        "variable": "preferred_channel",
                        "required": True,
                        "options": ["Desktop", "Mobile", "Tablet"],
                        "option_values": ["desktop", "mobile", "tablet"],
                    },
                },
                {
                    "id": "effort",
                    "type": "rangeInput",
                    "position": {"x": 500, "y": 0},
                    "data": {"label": "Effort", "variable": "effort", "required": True, "min_value": 0, "max_value": 10, "step": 2},
                },
                {
                    "id": "rating",
                    "type": "ratingInput",
                    "position": {"x": 750, "y": 0},
                    "data": {"label": "Rating", "variable": "rating", "required": True, "min_value": 1, "max_value": 5, "step": 1},
                },
                {
                    "id": "date",
                    "type": "dateInput",
                    "position": {"x": 1000, "y": 0},
                    "data": {"label": "Date", "variable": "selected_date", "required": True, "min_date": "2026-01-01", "max_date": "2026-12-31"},
                },
                {
                    "id": "links",
                    "type": "links",
                    "position": {"x": 1250, "y": 0},
                    "data": {"label": "Resources", "links": [{"label": "Guide", "url": "https://example.com/guide"}]},
                },
                {
                    "id": "thanks",
                    "type": "thankYou",
                    "position": {"x": 1500, "y": 0},
                    "data": {"label": "Thank you", "cta_label": "Continue", "cta_url": "https://example.com/next"},
                },
            ],
            "edges": [
                {"id": "one", "source": "start", "target": "channel"},
                {"id": "two", "source": "channel", "target": "effort"},
                {"id": "three", "source": "effort", "target": "rating"},
                {"id": "four", "source": "rating", "target": "date"},
                {"id": "five", "source": "date", "target": "links"},
                {"id": "six", "source": "links", "target": "thanks"},
            ],
            "variables": [],
        }
        request(f"/bots/{test_bot_id}/flow", method="PUT", payload=flow, token=token)
        validation = request(f"/bots/{test_bot_id}/validate", method="POST", token=token)
        assert validation["valid"] is True, validation

        preview = request(
            f"/bots/{test_bot_id}/preview/start",
            method="POST",
            payload={"session_id": f"v2b-preview-{uuid4().hex}"},
            token=token,
        )
        preview_done = complete_conversation(preview)
        assert preview_done["status"] == "completed"
        assert preview_done["variables"]["preferred_channel"] == "mobile"
        assert preview_done["variables"]["effort"] == 8
        assert preview_done["variables"]["rating"] == 5
        assert preview_done["variables"]["selected_date"] == "2026-09-19"
        assert [item["type"] for item in preview_done["messages"]] == ["links"]
        assert preview_done["next_node"]["type"] == "thankYou"

        published = request(f"/bots/{test_bot_id}/publish", method="POST", token=token)
        public = request(
            f"/public/{published['bot']['slug']}/start",
            method="POST",
            payload={"session_id": f"v2b-public-{uuid4().hex}"},
        )
        public_done = complete_conversation(public)
        assert public_done["status"] == "completed"
        assert public_done["variables"] == preview_done["variables"]

        print(
            json.dumps(
                {
                    "validation": validation["valid"],
                    "published_version": published["version"]["version_number"],
                    "preview_status": preview_done["status"],
                    "public_status": public_done["status"],
                    "stored_option_value": public_done["variables"]["preferred_channel"],
                    "links_rendered": len(public_done["messages"][0]["data"]["links"]),
                    "terminal_type": public_done["next_node"]["type"],
                },
                indent=2,
            )
        )
    finally:
        if test_bot_id:
            with SessionLocal() as session:
                session.execute(delete(Bot).where(Bot.id == UUID(test_bot_id)))
                session.commit()


if __name__ == "__main__":
    main()
