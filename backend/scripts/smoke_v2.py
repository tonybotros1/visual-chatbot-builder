"""Exercise the running V2A subflow workflow and remove its temporary bot."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.bot import Bot


API_URL = "http://127.0.0.1:8000/api"
DEMO_SUBFLOW_ID = "00000000-0000-0000-0000-000000000003"


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


def main() -> None:
    token = request(
        "/auth/login",
        method="POST",
        payload={"email": "demo@example.com", "password": "demo1234"},
    )["access_token"]
    test_bot_id: str | None = None
    try:
        subflows = request("/subflows", token=token)
        component = next(item for item in subflows if item["id"] == DEMO_SUBFLOW_ID)
        versions = request(f"/subflows/{DEMO_SUBFLOW_ID}/versions", token=token)
        version = next(item for item in versions if item["version_number"] == 1)
        component_validation = request(
            f"/subflows/{DEMO_SUBFLOW_ID}/validate",
            method="POST",
            token=token,
        )
        assert component_validation["valid"] is True, component_validation

        created = request(
            "/bots",
            method="POST",
            payload={"name": f"V2 smoke {uuid4().hex[:8]}", "description": "Temporary V2 QA bot"},
            token=token,
        )
        test_bot_id = created["id"]
        flow = {
            "nodes": [
                {"id": "start", "type": "start", "position": {"x": 50, "y": 150}, "data": {"label": "Start"}},
                {
                    "id": "consent",
                    "type": "setVariable",
                    "position": {"x": 300, "y": 150},
                    "data": {"label": "Set consent", "variable": "consent", "value": "Yes"},
                },
                {
                    "id": "component",
                    "type": "subflow",
                    "position": {"x": 560, "y": 150},
                    "data": {
                        "label": component["name"],
                        "subflow_id": DEMO_SUBFLOW_ID,
                        "subflow_name": component["name"],
                        "subflow_version_id": version["id"],
                        "version_number": version["version_number"],
                        "inputs": {"continue_choice": "{{consent}}"},
                        "outputs": {"approved": "eligibility.approved"},
                    },
                },
                {"id": "end", "type": "end", "position": {"x": 850, "y": 150}, "data": {"label": "Done"}},
            ],
            "edges": [
                {"id": "start-consent", "source": "start", "target": "consent"},
                {"id": "consent-component", "source": "consent", "target": "component"},
                {"id": "component-end", "source": "component", "target": "end"},
            ],
            "variables": [],
        }
        request(f"/bots/{test_bot_id}/flow", method="PUT", payload=flow, token=token)
        validation = request(f"/bots/{test_bot_id}/validate", method="POST", token=token)
        assert validation["valid"] is True, validation

        preview = request(
            f"/bots/{test_bot_id}/preview/start",
            method="POST",
            payload={"session_id": f"v2-preview-{uuid4().hex}"},
            token=token,
        )
        assert preview["status"] == "completed"
        assert preview["variables"]["eligibility.approved"] is True

        published = request(f"/bots/{test_bot_id}/publish", method="POST", token=token)
        published_number = published["version"]["version_number"]
        dependencies = request(
            f"/bots/{test_bot_id}/versions/{published_number}/dependencies",
            token=token,
        )
        assert len(dependencies) == 1
        assert dependencies[0]["dependency_version_id"] == version["id"]

        public = request(
            f"/public/{published['bot']['slug']}/start",
            method="POST",
            payload={"session_id": f"v2-public-{uuid4().hex}"},
        )
        assert public["status"] == "completed"
        assert public["variables"]["eligibility.approved"] is True

        print(
            json.dumps(
                {
                    "component": component["name"],
                    "component_version": version["version_number"],
                    "component_validation": component_validation["valid"],
                    "bot_validation": validation["valid"],
                    "preview_status": preview["status"],
                    "public_status": public["status"],
                    "returned_fact": public["variables"]["eligibility.approved"],
                    "pinned_dependencies": len(dependencies),
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
