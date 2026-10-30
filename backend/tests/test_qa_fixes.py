import pytest
from pydantic import ValidationError

from app.engine.validator import validate_flow
from app.schemas.deployment import TargetSegmentCreate, rules_dict


def test_condition_can_use_a_variable_written_by_a_logic_node() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "pain", "type": "numberInput", "data": {"variable": "pain"}},
            {"id": "table", "type": "decisionTable", "data": {"logic_version_id": "v1", "inputs": {"pain": "{{pain}}"}, "outputs": {"priority": "priority"}}},
            {"id": "urgent", "type": "condition", "data": {"variable": "priority", "operator": "==", "value": "high"}},
            {"id": "a", "type": "end", "data": {}},
            {"id": "b", "type": "end", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "pain"},
            {"source": "pain", "target": "table"},
            {"source": "table", "target": "urgent"},
            {"source": "urgent", "sourceHandle": "true", "target": "a"},
            {"source": "urgent", "sourceHandle": "false", "target": "b"},
        ],
    }
    report = validate_flow(flow)
    assert not any(issue.code == "missing_condition_variable" for issue in report.issues)


def test_targeting_rules_reject_unknown_shapes() -> None:
    with pytest.raises(ValidationError):
        TargetSegmentCreate(name="Bad", rules={"match": {"all": [{"field": "language"}]}})
    good = TargetSegmentCreate(name="Good", rules={"match": {"combinator": "all", "conditions": [{"field": "language", "operator": "starts_with", "value": "en"}]}})
    assert rules_dict(good.rules) == {"match": {"combinator": "all", "conditions": [{"field": "language", "operator": "starts_with", "value": "en"}], "groups": []}}
