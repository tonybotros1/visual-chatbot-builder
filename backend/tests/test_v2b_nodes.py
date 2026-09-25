import pytest

from app.engine.executor import EngineError, advance_flow, answer_target, validate_answer
from app.engine.validator import validate_flow


def test_choice_labels_can_store_stable_values_and_keep_branching() -> None:
    node = {
        "id": "plan",
        "type": "singleChoice",
        "data": {
            "required": True,
            "options": ["Starter", "Professional"],
            "option_values": ["starter", "pro"],
        },
    }
    flow = {
        "nodes": [node],
        "edges": [
            {"source": "plan", "sourceHandle": "option-0", "target": "starter-end"},
            {"source": "plan", "sourceHandle": "option-1", "target": "pro-end"},
        ],
    }

    normalized = validate_answer(node, "Professional")

    assert normalized == "pro"
    assert answer_target(flow, node, normalized) == "pro-end"


def test_optional_choice_uses_its_skip_route() -> None:
    node = {
        "id": "plan",
        "type": "singleChoice",
        "data": {
            "required": False,
            "options": ["Starter", "Professional"],
            "option_values": ["starter", "pro"],
        },
    }
    flow = {
        "nodes": [node],
        "edges": [
            {"source": "plan", "sourceHandle": "option-0", "target": "starter-end"},
            {"source": "plan", "sourceHandle": "option-1", "target": "pro-end"},
            {"source": "plan", "sourceHandle": "skip", "target": "skip-end"},
        ],
    }

    normalized = validate_answer(node, None)

    assert normalized is None
    assert answer_target(flow, node, normalized) == "skip-end"


def test_optional_choice_requires_a_connected_skip_route() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "plan",
                "type": "singleChoice",
                "data": {"required": False, "options": ["Yes"]},
            },
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "plan"},
            {"source": "plan", "sourceHandle": "option-0", "target": "end"},
        ],
    }

    report = validate_flow(flow)

    assert report.valid is False
    assert any(
        issue.code == "unconnected_choice" and "Skip" in issue.message
        for issue in report.issues
    )


def test_multi_select_routes_from_its_first_selected_option() -> None:
    node = {
        "id": "channels",
        "type": "multipleChoice",
        "data": {
            "required": True,
            "options": ["Email", "SMS", "Phone"],
            "option_values": ["email", "sms", "phone"],
        },
    }
    flow = {
        "nodes": [node],
        "edges": [
            {"source": "channels", "sourceHandle": "option-0", "target": "email-end"},
            {"source": "channels", "sourceHandle": "option-1", "target": "sms-end"},
            {"source": "channels", "sourceHandle": "option-2", "target": "phone-end"},
        ],
    }

    normalized = validate_answer(node, ["sms", "email"])

    assert normalized == ["sms", "email"]
    assert answer_target(flow, node, normalized) == "sms-end"


def test_v2b_text_number_date_and_multi_select_validation() -> None:
    text = {
        "type": "textInput",
        "data": {"required": True, "min_length": 3, "max_length": 6, "pattern": r"[A-Z]+"},
    }
    assert validate_answer(text, "PAUL") == "PAUL"
    with pytest.raises(EngineError, match="at least 3"):
        validate_answer(text, "AB")

    slider = {
        "type": "rangeInput",
        "data": {"required": True, "min_value": 0, "max_value": 10, "step": 2},
    }
    assert validate_answer(slider, "8") == 8
    with pytest.raises(EngineError, match="increments of 2"):
        validate_answer(slider, 7)

    date_node = {
        "type": "dateInput",
        "data": {"required": True, "min_date": "2026-01-01", "max_date": "2026-12-31"},
    }
    assert validate_answer(date_node, "2026-09-19") == "2026-09-19"
    with pytest.raises(EngineError, match="on or after"):
        validate_answer(date_node, "2025-12-31")

    multi = {
        "type": "multipleChoice",
        "data": {
            "required": True,
            "options": ["Email", "SMS", "Phone"],
            "option_values": ["email", "sms", "phone"],
            "min_selections": 1,
            "max_selections": 2,
        },
    }
    assert validate_answer(multi, ["Email", "sms"]) == ["email", "sms"]
    with pytest.raises(EngineError, match="no more than 2"):
        validate_answer(multi, ["email", "sms", "phone"])


def test_links_and_thank_you_execute_as_message_and_terminal_nodes() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "links",
                "type": "links",
                "data": {
                    "label": "Resources",
                    "links": [{"label": "Guide", "url": "https://example.com/guide"}],
                },
            },
            {"id": "done", "type": "thankYou", "data": {"label": "Thank you"}},
        ],
        "edges": [
            {"source": "start", "target": "links"},
            {"source": "links", "target": "done"},
        ],
    }

    report = validate_flow(flow)
    result = advance_flow(flow, "start", {})

    assert report.valid is True
    assert [message["id"] for message in result.messages] == ["links"]
    assert result.completed is True
    assert result.next_node is not None
    assert result.next_node["type"] == "thankYou"


@pytest.mark.parametrize(
    ("node_type", "data"),
    [
        ("fileUpload", {"variable": "provider_result", "required": True, "max_files": 1, "max_file_size_mb": 10}),
        ("payment", {"variable": "provider_result", "required": True, "provider": "sandbox", "amount": 10, "currency": "USD"}),
        ("appointment", {"variable": "provider_result", "required": True, "provider": "local", "duration_minutes": 30}),
    ],
)
def test_local_provider_nodes_are_publishable(node_type: str, data: dict) -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "provider",
                "type": node_type,
                "data": data,
            },
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "provider"},
            {"source": "provider", "target": "end"},
        ],
    }

    report = validate_flow(flow)

    assert report.valid is True


def test_appointment_accepts_midnight_close_and_rejects_invalid_hours() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {"label": "Start"}},
            {"id": "booking", "type": "appointment", "data": {"label": "Book", "variable": "booking", "duration_minutes": 30, "opening_hour": 0, "closing_hour": 24}},
            {"id": "end", "type": "end", "data": {"label": "Done"}},
        ],
        "edges": [{"source": "start", "target": "booking"}, {"source": "booking", "target": "end"}],
        "variables": [],
    }
    assert validate_flow(flow).valid is True

    flow["nodes"][1]["data"]["closing_hour"] = 25
    report = validate_flow(flow)
    assert report.valid is False
    assert any(issue.code == "invalid_appointment_hours" for issue in report.issues)


def test_invalid_link_is_blocked_from_publication() -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {
                "id": "phone",
                "type": "phoneInput",
                "data": {"variable": "phone", "otp_required": True},
            },
            {
                "id": "links",
                "type": "links",
                "data": {"links": [{"label": "Unsafe", "url": "javascript:alert(1)"}]},
            },
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "phone"},
            {"source": "phone", "target": "links"},
            {"source": "links", "target": "end"},
        ],
    }

    codes = {issue.code for issue in validate_flow(flow).issues}

    assert "invalid_link_url" in codes


@pytest.mark.parametrize(
    "link",
    [
        {"link_type": "email", "label": "Email us", "url": "help@example.com"},
        {"link_type": "phone", "label": "Call us", "url": "+971 50 123 4567"},
        {"link_type": "whatsapp", "label": "WhatsApp", "url": "971501234567"},
        {"link_type": "linkedin", "label": "LinkedIn", "url": "https://linkedin.com/company/example"},
    ],
)
def test_link_types_accept_valid_destinations(link: dict) -> None:
    flow = {
        "nodes": [
            {"id": "start", "type": "start", "data": {}},
            {"id": "links", "type": "links", "data": {"links": [link]}},
            {"id": "end", "type": "end", "data": {}},
        ],
        "edges": [
            {"source": "start", "target": "links"},
            {"source": "links", "target": "end"},
        ],
    }

    assert validate_flow(flow).valid is True
