from starlette.requests import Request

from app.engine.executor import answer_target
from app.services.conversation_service import interpolate_node, interpolate_text, variable_text
from app.services.visitor_context import client_ip, parse_user_agent, visitor_context


def test_placeholders_use_collected_answers() -> None:
    variables = {"name": "Tony", "city": None, "days": ["Mon", "Tue"], "ok": True, "file": {"name": "scan.pdf"}}
    assert interpolate_text("Hi {{name}}, {{ days }} / {{ok}} / {{file}} / {{missing}}!", variables) == "Hi Tony, Mon, Tue / Yes / scan.pdf / !"
    assert interpolate_text("No placeholders here", variables) == "No placeholders here"
    assert variable_text(3.5) == "3.5"


def test_interpolate_node_only_touches_visible_text() -> None:
    node = {"id": "q", "type": "message", "data": {"label": "Thanks {{name}}", "variable": "{{name}}", "description": "{{name}} again"}}
    filled = interpolate_node(node, {"name": "Tony"})
    assert filled["data"]["label"] == "Thanks Tony"
    assert filled["data"]["description"] == "Tony again"
    assert filled["data"]["variable"] == "{{name}}"
    assert node["data"]["label"] == "Thanks {{name}}"  # the flow itself is untouched
    assert interpolate_node({"id": "x", "data": {"label": "plain"}}, {}) == {"id": "x", "data": {"label": "plain"}}


def test_single_next_choice_routes_through_one_handle() -> None:
    flow = {"edges": [{"source": "q", "target": "after", "sourceHandle": "next"}, {"source": "q", "target": "other", "sourceHandle": "option-0"}]}
    node = {"id": "q", "type": "multipleChoice", "data": {"options": ["A", "B"], "single_next": True}}
    assert answer_target(flow, node, ["B"]) == "after"
    assert answer_target(flow, node, []) == "after"
    branching = {"id": "q", "type": "multipleChoice", "data": {"options": ["A", "B"]}}
    assert answer_target(flow, branching, ["A"]) == "other"


def _request(headers: dict[str, str], client=("203.0.113.9", 1234)) -> Request:
    raw = [(key.lower().encode(), value.encode()) for key, value in headers.items()]
    return Request({"type": "http", "scheme": "http", "server": ("api", 80), "path": "/", "root_path": "", "headers": raw, "query_string": b"", "client": client})


def test_visitor_context_reads_address_and_user_agent() -> None:
    ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1"
    request = _request({"user-agent": ua, "accept-language": "ar-AE,ar;q=0.9", "x-forwarded-for": "198.51.100.7, 10.0.0.1"})
    assert client_ip(request) == "198.51.100.7"
    context = visitor_context(request, locate=False)
    assert context["ip"] == "198.51.100.7"
    assert context["browser"] == "Chrome" and context["os"] == "iOS" and context["device"] == "mobile"
    assert context["accept_language"] == "ar-AE"
    assert visitor_context(None) == {}


def test_user_agent_classes() -> None:
    assert parse_user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0") == {"browser": "Edge", "os": "Windows", "device": "desktop"}
    assert parse_user_agent("Mozilla/5.0 (Linux; Android 13; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")["device"] == "tablet"
    assert parse_user_agent("")["device"] == ""
