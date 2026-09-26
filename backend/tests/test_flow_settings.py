from types import SimpleNamespace
from uuid import uuid4

from app.schemas.flow import FlowDocument
from app.services.conversation_service import _flow_progress, _state


def test_flow_document_preserves_builder_settings() -> None:
    document = FlowDocument.model_validate(
        {
            "settings": {
                "enabled": True,
                "show_progress_bar": True,
                "response_delay_seconds": 1,
                "delivery_mode": "embed",
                "timezone": "Asia/Dubai",
                "collect_visitor_context": False,
            }
        }
    )

    assert document.model_dump()["settings"]["delivery_mode"] == "embed"
    assert document.model_dump()["settings"]["response_delay_seconds"] == 1


def test_flow_progress_uses_node_numbers_and_completes_at_one_hundred() -> None:
    flow = {
        "nodes": [
            {"id": "start", "data": {"node_number": 1}},
            {"id": "question", "data": {"node_number": 2}},
            {"id": "end", "data": {"node_number": 4}},
        ]
    }

    assert _flow_progress(flow, flow["nodes"][1], False) == 50
    assert _flow_progress(flow, flow["nodes"][2], True) == 100


def test_runtime_state_exposes_settings_and_progress() -> None:
    conversation = SimpleNamespace(
        id=uuid4(),
        session_id="settings-test",
        status="active",
        variables={},
        runtime_state={},
    )

    state = _state(
        conversation,
        [],
        None,
        {},
        {"show_progress_bar": True},
        42.5,
    )

    assert state.settings == {"show_progress_bar": True}
    assert state.progress_percent == 42.5
