"""Round-trip a small blob through the configured Azure storage, then run a real visitor upload.

Usage (inside the backend container): python -m scripts.azure_storage_check
Prints a JSON summary; exits non-zero when Azure is not configured or a step fails.
"""

from __future__ import annotations

import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from sqlalchemy import select

from app.database.session import SessionLocal
from app.models.bot import Bot, BotVersion
from app.models.provider import StoredFile
from app.services.azure_blob import config_from_settings, platform_client

API = "http://localhost:8000/api"


def api(path: str, method: str = "GET", payload: dict | None = None, raw: bytes | None = None, content_type: str = "application/json") -> dict:
    data = raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
    request = Request(f"{API}{path}" if path.startswith("/") else path, method=method, data=data, headers={"Content-Type": content_type})
    try:
        with urlopen(request, timeout=60) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except HTTPError as exc:
        raise SystemExit(f"{method} {path} -> HTTP {exc.code}: {exc.read(600).decode(errors='replace')}") from exc


def main() -> None:
    config = config_from_settings()
    if config is None:
        print("Azure storage is not configured (AZURE_STORAGE_* empty)")
        sys.exit(1)
    client = platform_client()
    assert client is not None
    probe = f"healthchecks/{uuid4().hex}.txt"
    client.upload(probe, b"spaghetti azure probe", "text/plain")
    assert client.download(probe) == b"spaghetti azure probe"
    client.delete(probe)
    summary: dict = {"account": config.account, "container": config.container, "direct_round_trip": "ok"}

    # A real visitor upload through the public API, using any published bot that has a file-upload node.
    with SessionLocal() as session:
        rows = session.execute(
            select(Bot.slug, BotVersion.flow_json).join(BotVersion, BotVersion.bot_id == Bot.id)
            .where(Bot.status == "published", BotVersion.published.is_(True))
        ).all()
    # Prefer the smallest published bot that has a platform-storage upload node (fewest answers to walk).
    candidates = []
    for slug, flow in rows:
        for node in flow.get("nodes", []):
            if node.get("type") == "fileUpload" and str(node.get("data", {}).get("storage_provider") or "local") == "local":
                candidates.append((len(flow.get("nodes", [])), slug, node["id"]))
                break
    candidates.sort()
    target = (candidates[0][1], candidates[0][2]) if candidates else None
    if target is None:
        summary["visitor_upload"] = "skipped (no published bot with a platform-storage file-upload node)"
        print(json.dumps(summary, indent=2))
        return
    slug, node_id = target
    started = api(f"/public/{slug}/start", "POST", {"session_id": f"azure-check-{uuid4().hex[:8]}"})
    conversation_id = started["conversation_id"]
    # Answer whatever comes first until the upload node is current (bounded).
    current = started.get("next_node") or {}
    for _ in range(25):
        if current.get("id") == node_id or not current:
            break
        node_type = current.get("type")
        sample = {"emailInput": "check@example.com", "phoneInput": "+971501234567", "numberInput": 5, "dateInput": "2026-11-10", "rating": 5, "consent": True}
        value = sample.get(node_type, "ok")
        if node_type in {"choice", "singleChoice", "multipleChoice", "yesNo"}:
            options = current.get("data", {}).get("options") or ["Yes"]
            value = options[0]
        step = api(f"/conversations/{conversation_id}/answer", "POST", {"node_id": current["id"], "value": value})
        current = step.get("next_node") or {}
    if current.get("id") != node_id:
        summary["visitor_upload"] = f"skipped (could not reach the upload node in {slug})"
        print(json.dumps(summary, indent=2))
        return
    content = b"%PDF-1.4 azure check\n" + uuid4().bytes
    ticket = api("/public/provider-actions/files/initiate", "POST", {"conversation_id": conversation_id, "node_id": node_id, "name": "azure-check.pdf", "type": "application/pdf", "size": len(content)})
    uploaded = api(ticket["upload_url"], "PUT", raw=content, content_type="application/pdf")
    with SessionLocal() as session:
        item = session.get(StoredFile, uploaded["file_id"])
        assert item is not None
        summary["visitor_upload"] = {"storage_provider": item.storage_provider, "storage_key": item.storage_key, "scan_status": item.scan_status}
        assert item.storage_provider == "azure", item.storage_provider
    with urlopen(uploaded["download_url"], timeout=60) as response:
        assert response.read() == content
    summary["download_via_api"] = "ok"
    client.delete(item.storage_key)
    with SessionLocal() as session:
        session.delete(session.get(StoredFile, uploaded["file_id"]))
        session.commit()
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
