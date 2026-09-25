import pytest

from app.database.seed import DEFAULT_FLOW
from app.engine.executor import EngineError, advance_flow, answer_target, evaluate_condition, validate_answer


def test_default_flow_advances_to_choice_and_collects_message() -> None:
    result = advance_flow(DEFAULT_FLOW, "start", {})

    assert [message["id"] for message in result.messages] == ["welcome-message"]
    assert result.next_node is not None
    assert result.next_node["id"] == "continue-choice"
    assert result.completed is False


def test_choice_yes_reaches_end() -> None:
    choice = next(node for node in DEFAULT_FLOW["nodes"] if node["id"] == "continue-choice")
    target = answer_target(DEFAULT_FLOW, choice, "Yes")
    result = advance_flow(DEFAULT_FLOW, target or "", {"continue_choice": "Yes"})

    assert result.completed is True
    assert result.next_node is not None
    assert result.next_node["id"] == "yes-end"


def test_condition_supports_numeric_values_from_properties_panel() -> None:
    assert evaluate_condition({"variable": "age", "operator": ">=", "value": "18"}, {"age": 25})


def test_number_and_email_validation() -> None:
    assert validate_answer({"type": "numberInput", "data": {"required": True}}, "25") == 25
    with pytest.raises(EngineError, match="valid email"):
        validate_answer({"type": "emailInput", "data": {"required": True}}, "not-email")

