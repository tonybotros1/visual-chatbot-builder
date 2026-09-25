import pytest

from app.engine.executor import EngineError
from app.engine.subflows import (
    LoadedFlow,
    advance_runtime,
    apply_runtime_answer,
    initial_runtime_state,
)


def test_runtime_applies_locale_catalog_to_messages_and_options() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "hello", "type": "message", "data": {"label": "Hello"}},
            {"id": "choice", "type": "singleChoice", "data": {"label": "Continue?", "variable": "continue", "options": ["Yes", "No"]}},
        ],
        "edges": [{"source": "start", "target": "hello"}, {"source": "hello", "target": "choice"}],
    }

    def loader(kind: str, version_id: str) -> LoadedFlow:
        return LoadedFlow(kind=kind, version_id=version_id, flow=flow, input_schema={}, output_schema={}, published=True)

    state = initial_runtime_state("version", "start", locale="ar", direction="rtl", translations={"hello.label": "مرحبا", "choice.label": "متابعة؟", "choice.option.0": "نعم"})
    result = advance_runtime(loader, state)

    assert result.messages[0]["data"]["label"] == "مرحبا"
    assert result.next_node["data"]["label"] == "متابعة؟"
    assert result.next_node["data"]["options"] == ["نعم", "No"]
from app.engine.validator import validate_flow


BOT_VERSION_ID = "00000000-0000-0000-0000-000000000101"
SUBFLOW_VERSION_ID = "00000000-0000-0000-0000-000000000102"


def test_subflow_maps_typed_inputs_and_outputs() -> None:
    bot_flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "answer",
                "type": "setVariable",
                "data": {"variable": "consent", "value": "Yes"},
            },
            {
                "id": "call",
                "type": "subflow",
                "data": {
                    "subflow_version_id": SUBFLOW_VERSION_ID,
                    "inputs": {"continue_choice": "{{consent}}"},
                    "outputs": {"approved": "eligibility.approved"},
                },
            },
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "answer"},
            {"source": "answer", "target": "call"},
            {"source": "call", "target": "end"},
        ],
    }
    subflow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "approve",
                "type": "setVariable",
                "data": {"variable": "approved", "value": True},
            },
            {"id": "return", "type": "return", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "approve"},
            {"source": "approve", "target": "return"},
        ],
    }
    loader = _loader(bot_flow, subflow)

    result = advance_runtime(loader, initial_runtime_state(BOT_VERSION_ID, "start"))

    assert result.completed is True
    assert result.next_node is not None
    assert result.next_node["id"] == "end"
    assert result.variables == {"consent": "Yes", "eligibility.approved": True}
    assert len(result.runtime_state["frames"]) == 1


def test_subflow_can_pause_for_an_answer_and_resume_parent() -> None:
    bot_flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "call",
                "type": "subflow",
                "data": {
                    "subflow_version_id": SUBFLOW_VERSION_ID,
                    "inputs": {},
                    "outputs": {"name": "patient.name"},
                },
            },
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "call"},
            {"source": "call", "target": "end"},
        ],
    }
    subflow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "name",
                "type": "textInput",
                "data": {"variable": "name", "required": True},
            },
            {"id": "return", "type": "return", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "name"},
            {"source": "name", "target": "return"},
        ],
    }
    loader = _loader(
        bot_flow,
        subflow,
        input_schema={},
        output_schema={"name": {"type": "string", "required": True}},
    )
    waiting = advance_runtime(loader, initial_runtime_state(BOT_VERSION_ID, "start"))

    assert waiting.completed is False
    assert waiting.next_node is not None
    assert waiting.next_node["id"] == "name"
    assert len(waiting.runtime_state["frames"]) == 2

    answered_state, variable_name, normalized = apply_runtime_answer(
        loader,
        waiting.runtime_state,
        "name",
        "Maya",
    )
    completed = advance_runtime(loader, answered_state)

    assert variable_name == "name"
    assert normalized == "Maya"
    assert completed.completed is True
    assert completed.variables["patient.name"] == "Maya"


def test_subflow_cycle_is_rejected() -> None:
    bot_flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "call",
                "type": "subflow",
                "data": {"subflow_version_id": SUBFLOW_VERSION_ID},
            },
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "call"},
            {"source": "call", "target": "end"},
        ],
    }
    recursive_subflow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "again",
                "type": "subflow",
                "data": {"subflow_version_id": SUBFLOW_VERSION_ID},
            },
            {"id": "return", "type": "return", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "again"},
            {"source": "again", "target": "return"},
        ],
    }

    with pytest.raises(EngineError, match="Circular subflow"):
        advance_runtime(
            _loader(bot_flow, recursive_subflow, input_schema={}, output_schema={}),
            initial_runtime_state(BOT_VERSION_ID, "start"),
        )


def test_subflow_validator_accepts_contract_inputs_and_requires_return() -> None:
    valid_flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "condition",
                "type": "condition",
                "data": {"variable": "age", "operator": ">=", "value": 18},
            },
            {"id": "yes", "type": "return", "data": {}},
            {"id": "no", "type": "return", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "condition"},
            {"source": "condition", "sourceHandle": "true", "target": "yes"},
            {"source": "condition", "sourceHandle": "false", "target": "no"},
        ],
    }

    report = validate_flow(
        valid_flow,
        terminal_types={"return"},
        external_variables={"age"},
    )

    assert report.valid is True
    assert report.issues == []


def test_subflow_validator_rejects_unwritten_required_output() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "return", "type": "return", "data": {}},
        ],
        "edges": [{"source": "start", "target": "return"}],
    }

    report = validate_flow(
        flow,
        terminal_types={"return"},
        required_outputs={"result"},
    )

    assert report.valid is False
    assert any(issue.code == "missing_output_fact" for issue in report.issues)


def _loader(
    bot_flow: dict,
    subflow: dict,
    *,
    input_schema: dict | None = None,
    output_schema: dict | None = None,
):
    def load(kind: str, version_id: str) -> LoadedFlow:
        if kind == "bot" and version_id == BOT_VERSION_ID:
            return LoadedFlow("bot", version_id, bot_flow, {}, {}, True)
        if kind == "subflow" and version_id == SUBFLOW_VERSION_ID:
            return LoadedFlow(
                "subflow",
                version_id,
                subflow,
                input_schema
                if input_schema is not None
                else {
                    "continue_choice": {
                        "type": "enum",
                        "required": True,
                        "values": ["Yes", "No"],
                    }
                },
                output_schema
                if output_schema is not None
                else {"approved": {"type": "boolean", "required": True}},
                True,
            )
        raise EngineError("Version not found")

    return load


def test_preview_can_complete_at_an_unconnected_input_leaf() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "email", "type": "emailInput", "data": {"label": "Email", "variable": "email"}},
        ],
        "edges": [{"source": "start", "target": "email"}],
    }

    def loader(kind: str, version_id: str) -> LoadedFlow:
        return LoadedFlow(kind, version_id, flow, {}, {}, False)

    preview = initial_runtime_state("draft", "start", debug=True)
    waiting = advance_runtime(loader, preview)
    preview, _, normalized = apply_runtime_answer(loader, waiting.runtime_state, "email", "qa@example.com")
    completed = advance_runtime(loader, preview)

    assert normalized == "qa@example.com"
    assert completed.completed is True
    assert completed.variables["email"] == "qa@example.com"

    production = initial_runtime_state("published", "start", debug=False)
    waiting = advance_runtime(loader, production)
    with pytest.raises(EngineError, match="no connected path"):
        apply_runtime_answer(loader, waiting.runtime_state, "email", "qa@example.com")
