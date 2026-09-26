from app.database.seed import DEFAULT_FLOW
from app.engine.validator import validate_flow, validate_flow_connections


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


def test_connection_validator_ignores_content_configuration_errors() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {"node_number": 1, "label": "Start"}},
            {
                "id": "links",
                "type": "links",
                "data": {
                    "node_number": 2,
                    "label": "Useful links",
                    "links": [{"link_type": "website", "label": "Empty", "url": ""}],
                },
            },
            {"id": "end", "type": "end", "data": {"node_number": 3, "label": "End"}},
        ],
        "edges": [
            {"id": "one", "source": "start", "target": "links"},
            {"id": "two", "source": "links", "target": "end"},
        ],
    }

    assert validate_flow(flow).valid is False
    connection_report = validate_flow_connections(flow)
    assert connection_report.valid is True
    assert connection_report.issues == []


def test_connection_validator_reports_only_unconnected_nodes() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {"node_number": 1, "label": "Start"}},
            {"id": "message", "type": "message", "data": {"node_number": 2, "label": "Welcome"}},
            {"id": "end", "type": "end", "data": {"node_number": 3, "label": "End"}},
            {"id": "orphan", "type": "message", "data": {"node_number": 4, "label": "Orphan"}},
        ],
        "edges": [
            {"id": "one", "source": "start", "target": "message"},
            {"id": "two", "source": "message", "target": "end"},
        ],
    }

    report = validate_flow_connections(flow)
    assert report.valid is False
    assert {issue.code for issue in report.issues} == {"unconnected_node"}
    assert [issue.node_ids for issue in report.issues] == [["orphan"]]
    assert "Node #4" in report.issues[0].message
