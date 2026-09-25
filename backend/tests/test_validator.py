from app.database.seed import DEFAULT_FLOW
from app.engine.validator import validate_flow


def test_default_flow_is_valid() -> None:
    report = validate_flow(DEFAULT_FLOW)

    assert report.valid is True
    assert report.issues == []


def test_reports_missing_end_and_dead_end() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "message", "type": "message", "data": {}},
        ],
        "edges": [{"id": "one", "source": "start", "target": "message"}],
    }

    report = validate_flow(flow)
    codes = {issue.code for issue in report.issues}

    assert report.valid is False
    assert "missing_end" in codes
    assert "dead_end" in codes


def test_reports_unconnected_choice_outputs() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "choice",
                "type": "choice",
                "data": {"options": ["Yes", "No"]},
            },
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"id": "one", "source": "start", "target": "choice"},
            {
                "id": "two",
                "source": "choice",
                "sourceHandle": "option-0",
                "target": "end",
            },
        ],
    }

    report = validate_flow(flow)

    assert report.valid is False
    assert any(issue.code == "unconnected_choice" for issue in report.issues)


def test_reports_unknown_condition_variable_and_missing_branch() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "condition",
                "type": "condition",
                "data": {"variable": "missing", "operator": ">=", "value": 18},
            },
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"id": "one", "source": "start", "target": "condition"},
            {
                "id": "two",
                "source": "condition",
                "sourceHandle": "true",
                "target": "end",
            },
        ],
    }

    report = validate_flow(flow)
    codes = {issue.code for issue in report.issues}

    assert report.valid is False
    assert "missing_condition_variable" in codes
    assert "unconnected_condition" in codes
