"""Exercise the running V1 stack through its public HTTP interfaces."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

from sqlalchemy import delete

from app.database.session import SessionLocal
from app.models.bot import Bot
from app.database.seed import DEFAULT_FLOW


API_URL = "http://127.0.0.1:8000/api"
FRONTEND_URL = "http://frontend:3000/login"


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
    run_id = uuid4().hex[:12]
    health = request("/health")
    assert health == {"status": "ok"}

    login = request(
        "/auth/login",
        method="POST",
        payload={"email": "demo@example.com", "password": "demo1234"},
    )
    token = login["access_token"]
    assert login["user"]["email"] == "demo@example.com"
    assert request("/auth/me", token=token)["id"] == login["user"]["id"]

    test_bot_id: str | None = None
    try:
        bot = request("/bots", method="POST", payload={"name": f"V1 smoke {run_id}", "description": "Temporary V1 verification bot"}, token=token)
        test_bot_id = bot["id"]
        saved_flow = request(f"/bots/{test_bot_id}/flow", method="PUT", payload=DEFAULT_FLOW, token=token)
        assert saved_flow == DEFAULT_FLOW
        validation = request(f"/bots/{test_bot_id}/validate", method="POST", token=token)
        assert validation["valid"] is True, validation

        preview = request(f"/bots/{test_bot_id}/preview/start", method="POST", payload={"session_id": f"smoke-preview-{run_id}"}, token=token)
        assert preview["next_node"]["id"] == "continue-choice"
        preview_done = request(f"/conversations/{preview['conversation_id']}/answer", method="POST", payload={"node_id": "continue-choice", "value": "Yes"})
        assert preview_done["status"] == "completed"

        published = request(f"/bots/{test_bot_id}/publish", method="POST", token=token)
        public = request(f"/public/{published['bot']['slug']}/start", method="POST", payload={"session_id": f"smoke-public-{run_id}"})
        public_done = request(f"/conversations/{public['conversation_id']}/answer", method="POST", payload={"node_id": "continue-choice", "value": "No"})
        assert public_done["status"] == "completed"
        responses = request(f"/bots/{test_bot_id}/responses", token=token)
        detail = request(f"/conversations/{public['conversation_id']}", token=token)
        assert detail["answers"][0]["value"] == "No"

        with urlopen(FRONTEND_URL, timeout=15) as frontend_response: assert frontend_response.status == 200
        print(json.dumps({"health": health["status"], "authenticated_user": login["user"]["email"], "bot": bot["name"], "validation": validation["valid"], "published_version": published["version"]["version_number"], "preview_status": preview_done["status"], "public_status": public_done["status"], "responses_visible": len(responses), "frontend_status": 200}, indent=2))
    finally:
        if test_bot_id:
            with SessionLocal() as session:
                session.execute(delete(Bot).where(Bot.id == UUID(test_bot_id)))
                session.commit()


if __name__ == "__main__":
    main()
