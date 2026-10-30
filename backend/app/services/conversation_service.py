from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.engine.executor import EngineError
from app.engine.subflows import (
    LoadedFlow,
    advance_runtime,
    apply_runtime_answer,
    initial_runtime_state,
    direction_for_locale,
    locale_code_from_answer,
)
from app.models.bot import BotVersion
from app.models.conversation import Conversation, ConversationAnswer
from app.models.logic import LogicAsset, LogicAssetVersion
from app.models.localization import BotLocale
from app.models.subflow import SubflowVersion
from app.schemas.conversation import ConversationState, RuntimeNode
from app.services.integrations import enqueue_event
from app.services.providers import provider_answer_value


def start_conversation(
    db: Session,
    version: BotVersion,
    *,
    session_id: str | None = None,
    debug: bool = False,
    source: str = "public",
    metadata: dict[str, Any] | None = None,
    locale: str | None = None,
) -> ConversationState:
    flow = version.flow_json
    flow_settings = flow.get("settings", {})
    if flow_settings.get("enabled") is False and source != "preview":
        raise EngineError("This chatbot is temporarily unavailable")
    start_nodes = [node for node in flow.get("nodes", []) if node.get("type") == "start"]
    if len(start_nodes) != 1:
        raise EngineError("Published flow must contain exactly one Start node")
    locale_record = db.scalar(select(BotLocale).where(BotLocale.bot_id == version.bot_id, BotLocale.locale == locale.lower())) if locale else None
    if locale_record is None:
        locale_record = db.scalar(select(BotLocale).where(BotLocale.bot_id == version.bot_id, BotLocale.is_default.is_(True)))
    # A requested locale without a catalog still gets its natural direction (e.g. ?lang=ar is RTL).
    requested_code = locale_code_from_answer(locale) if locale else None
    runtime_state = initial_runtime_state(
        str(version.id), start_nodes[0]["id"], debug=debug,
        locale=locale_record.locale if locale_record else (requested_code or "en"),
        direction=locale_record.direction if locale_record else direction_for_locale(requested_code or "en"),
        translations=locale_record.translations if locale_record else {},
    )
    result = advance_runtime(_flow_loader(db), runtime_state, _logic_loader(db))
    conversation = Conversation(
        bot_id=version.bot_id,
        bot_version_id=version.id,
        session_id=session_id or uuid4().hex,
        status="completed" if result.completed else "active",
        current_node_id=result.next_node.get("id") if result.next_node else None,
        variables=result.variables,
        runtime_state=result.runtime_state,
        source=source,
        context_data=(metadata or {}) if flow_settings.get("collect_visitor_context", True) else {},
        tags=[],
        notes=[],
        completed_at=datetime.now(UTC) if result.completed else None,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    enqueue_event(db, "conversation.completed" if result.completed else "conversation.started", conversation)
    return _state(
        conversation,
        result.messages,
        result.next_node,
        flow.get("appearance", {}),
        flow_settings,
        _flow_progress(flow, result.next_node, result.completed),
    )


def submit_answer(
    db: Session,
    conversation: Conversation,
    version: BotVersion,
    node_id: str,
    value: Any,
) -> ConversationState:
    if conversation.status != "active" or conversation.current_node_id != node_id:
        raise EngineError("This node is not awaiting an answer")
    value = provider_answer_value(db, conversation, node_id, value)
    runtime_state = conversation.runtime_state or {
        "frames": [
            {
                "kind": "bot",
                "version_id": str(version.id),
                "node_id": conversation.current_node_id,
                "variables": dict(conversation.variables or {}),
            }
        ]
    }
    loader = _flow_loader(db)
    previous_locale = str((conversation.runtime_state or {}).get("locale") or "")
    runtime_state, variable_name, normalized = apply_runtime_answer(
        loader,
        runtime_state,
        node_id,
        value,
    )
    if str(runtime_state.get("locale") or "") != previous_locale:
        # The language question switched locale: overlay the bot's catalog for it when one exists.
        locale_record = db.scalar(
            select(BotLocale).where(BotLocale.bot_id == version.bot_id, BotLocale.locale == str(runtime_state["locale"]).lower())
        )
        if locale_record is not None:
            runtime_state["locale"] = locale_record.locale
            runtime_state["direction"] = locale_record.direction
            runtime_state["translations"] = locale_record.translations or {}
    db.add(
        ConversationAnswer(
            conversation_id=conversation.id,
            node_id=node_id,
            variable_name=variable_name,
            value=normalized,
        )
    )
    result = advance_runtime(loader, runtime_state, _logic_loader(db))
    conversation.variables = result.variables
    conversation.runtime_state = result.runtime_state
    conversation.current_node_id = result.next_node.get("id") if result.next_node else None
    if result.completed:
        conversation.status = "completed"
        conversation.completed_at = datetime.now(UTC)
    db.commit()
    db.refresh(conversation)
    if result.completed:
        enqueue_event(db, "conversation.completed", conversation)
    return _state(
        conversation,
        result.messages,
        result.next_node,
        version.flow_json.get("appearance", {}),
        version.flow_json.get("settings", {}),
        _flow_progress(version.flow_json, result.next_node, result.completed),
    )


def _flow_loader(db: Session):
    def load(kind: str, version_id: str) -> LoadedFlow:
        try:
            parsed_id = UUID(version_id)
        except ValueError as exc:
            raise EngineError(f"Invalid {kind} version ID") from exc
        if kind == "bot":
            version = db.get(BotVersion, parsed_id)
            if version is None:
                raise EngineError("Bot version no longer exists")
            return LoadedFlow(
                kind="bot",
                version_id=version_id,
                flow=version.flow_json,
                input_schema={},
                output_schema={},
                published=version.published,
            )
        if kind == "subflow":
            version = db.get(SubflowVersion, parsed_id)
            if version is None:
                raise EngineError("Referenced subflow version does not exist")
            return LoadedFlow(
                kind="subflow",
                version_id=version_id,
                flow=version.flow_json,
                input_schema=version.input_schema or {},
                output_schema=version.output_schema or {},
                published=version.published,
            )
        raise EngineError(f"Unsupported flow frame kind: {kind}")

    return load


def _logic_loader(db: Session):
    def load(kind: str, version_id: str):
        try:
            parsed_id = UUID(version_id)
        except ValueError as exc:
            raise EngineError("Invalid logic version ID") from exc
        version = db.get(LogicAssetVersion, parsed_id)
        if version is None:
            raise EngineError("Referenced logic version does not exist")
        asset = db.get(LogicAsset, version.logic_asset_id)
        if asset is None or asset.kind != kind:
            raise EngineError("Referenced logic version has the wrong type")
        from app.engine.logic import LoadedLogic

        return LoadedLogic(
            kind=asset.kind,
            version_id=version_id,
            definition=version.definition,
            input_schema=version.input_schema or {},
            output_schema=version.output_schema or {},
            published=version.published,
        )

    return load


def _state(
    conversation: Conversation,
    messages: list[dict[str, Any]],
    next_node: dict[str, Any] | None,
    appearance: dict[str, Any] | None = None,
    settings: dict[str, Any] | None = None,
    progress_percent: float = 0,
) -> ConversationState:
    return ConversationState(
        conversation_id=conversation.id,
        session_id=conversation.session_id,
        status=conversation.status,
        messages=[RuntimeNode.model_validate(item) for item in messages],
        next_node=RuntimeNode.model_validate(next_node) if next_node else None,
        variables=conversation.variables or {},
        trace=(conversation.runtime_state or {}).get("trace", [])
        if (conversation.runtime_state or {}).get("debug")
        else [],
        locale=str((conversation.runtime_state or {}).get("locale") or "en"),
        direction=str((conversation.runtime_state or {}).get("direction") or "ltr"),
        appearance=appearance or {},
        settings=settings or {},
        progress_percent=progress_percent,
    )


def _flow_progress(
    flow: dict[str, Any],
    next_node: dict[str, Any] | None,
    completed: bool,
) -> float:
    if completed:
        return 100
    numbered_nodes = [
        int(node.get("data", {}).get("node_number"))
        for node in flow.get("nodes", [])
        if str(node.get("data", {}).get("node_number", "")).isdigit()
    ]
    current_value = (next_node or {}).get("data", {}).get("node_number")
    if not numbered_nodes or not str(current_value or "").isdigit():
        return 0
    return round(min(99, max(0, int(current_value) / max(numbered_nodes) * 100)), 1)
