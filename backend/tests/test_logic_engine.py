import pytest

from app.engine.executor import EngineError
from app.engine.logic import LoadedLogic, evaluate_logic, validate_logic_definition
from app.engine.subflows import LoadedFlow, advance_runtime, initial_runtime_state


INPUT_SCHEMA = {
    "age": {"type": "number", "required": True, "values": []},
    "country": {"type": "string", "required": True, "values": []},
}
OUTPUT_SCHEMA = {
    "segment": {"type": "string", "required": True, "values": []},
}


def test_first_rule_set_returns_outputs_and_trace() -> None:
    asset = LoadedLogic(
        kind="rule_set",
        version_id="logic-1",
        definition={
            "strategy": "FIRST",
            "rules": [
                {
                    "id": "adult-ae",
                    "when": [
                        {"fact": "age", "operator": ">=", "value": 18},
                        {"fact": "country", "operator": "==", "value": "AE"},
                    ],
                    "outputs": {"segment": "adult-ae"},
                }
            ],
            "default_outputs": {"segment": "other"},
        },
        input_schema=INPUT_SCHEMA,
        output_schema=OUTPUT_SCHEMA,
        published=True,
    )

    result = evaluate_logic(asset, {"age": 32, "country": "AE"})

    assert result.outputs == {"segment": "adult-ae"}
    assert result.matched == ["adult-ae"]
    assert result.trace[0]["matched"] is True


def test_unique_decision_table_rejects_multiple_matches() -> None:
    asset = LoadedLogic(
        kind="decision_table",
        version_id="decision-1",
        definition={
            "hit_policy": "UNIQUE",
            "rows": [
                {"id": "one", "conditions": {"age": {"operator": ">=", "value": 18}}, "outputs": {"segment": "one"}},
                {"id": "two", "conditions": {"country": {"operator": "==", "value": "AE"}}, "outputs": {"segment": "two"}},
            ],
        },
        input_schema=INPUT_SCHEMA,
        output_schema=OUTPUT_SCHEMA,
        published=True,
    )

    with pytest.raises(EngineError, match="more than one row"):
        evaluate_logic(asset, {"age": 32, "country": "AE"})


def test_logic_definition_validation_detects_unknown_contract_fields() -> None:
    report = validate_logic_definition(
        "rule_set",
        {
            "rules": [
                {
                    "id": "bad",
                    "when": [{"fact": "missing", "operator": "==", "value": True}],
                    "outputs": {"unknown": "value"},
                }
            ]
        },
        INPUT_SCHEMA,
        OUTPUT_SCHEMA,
    )

    assert report.valid is False
    assert {issue.code for issue in report.issues} == {"unknown_logic_input", "unknown_logic_output"}


def test_runtime_executes_pinned_logic_node_and_records_trace() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "age", "type": "setVariable", "data": {"variable": "age", "value": 30}},
            {"id": "country", "type": "setVariable", "data": {"variable": "country", "value": "AE"}},
            {
                "id": "logic",
                "type": "ruleSet",
                "data": {
                    "logic_version_id": "logic-1",
                    "inputs": {"age": "{{age}}", "country": "{{country}}"},
                    "outputs": {"segment": "customer.segment"},
                },
            },
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "age"},
            {"source": "age", "target": "country"},
            {"source": "country", "target": "logic"},
            {"source": "logic", "target": "end"},
        ],
    }

    def flow_loader(kind: str, version_id: str) -> LoadedFlow:
        return LoadedFlow(kind, version_id, flow, {}, {}, True)

    def logic_loader(kind: str, version_id: str) -> LoadedLogic:
        return LoadedLogic(
            kind="rule_set",
            version_id=version_id,
            definition={
                "rules": [
                    {"id": "adult", "when": [{"fact": "age", "operator": ">=", "value": 18}], "outputs": {"segment": "adult"}}
                ]
            },
            input_schema=INPUT_SCHEMA,
            output_schema=OUTPUT_SCHEMA,
            published=True,
        )

    result = advance_runtime(
        flow_loader,
        initial_runtime_state("bot-1", "start", debug=True),
        logic_loader,
    )

    assert result.completed is True
    assert result.variables["customer.segment"] == "adult"
    logic_events = [item for item in result.runtime_state["trace"] if item["action"] == "logic_evaluated"]
    assert logic_events[0]["details"]["matched"] == ["adult"]
