from starlette.requests import Request

from app.api.routes.deployments import WIDGET_LAUNCHER_JS, _widget_config, javascript_sdk


def _flow(**appearance):
    return {
        "appearance": {"title": "Clinic", "primary_color": "#00A1B0", "avatar_url": "data:image/png;base64,abc", **appearance},
        "nodes": [
            {"id": "start", "type": "start", "data": {"label": "Start"}},
            {"id": "q1", "type": "textInput", "data": {"label": "<strong>What is</strong><br>your full name?"}},
        ],
        "edges": [{"id": "e1", "source": "start", "target": "q1"}],
    }


def test_widget_config_reads_position_welcome_and_first_question() -> None:
    widget = _widget_config(_flow(widget_position="left", widget_welcome=True), "Fallback")
    assert widget["position"] == "left"
    assert widget["welcome"] is True
    assert widget["welcome_text"] == "What is your full name?"
    assert widget["avatar_url"] == "data:image/png;base64,abc"
    assert widget["title"] == "Clinic"


def test_widget_config_defaults_and_custom_reply_avatar() -> None:
    widget = _widget_config(_flow(widget_position="sideways", widget_welcome=False, reply_avatar="custom", reply_avatar_url="data:image/png;base64,reply"), "Bot")
    assert widget["position"] == "right"
    assert widget["welcome"] is False
    assert widget["avatar_url"] == "data:image/png;base64,reply"
    assert _widget_config({}, "Bot") == {"position": "right", "welcome": True, "welcome_text": None, "avatar_url": None, "primary_color": None, "title": "Bot"}


def test_sdk_ships_the_launcher() -> None:
    request = Request({"type": "http", "scheme": "http", "server": ("api.test", 80), "path": "/", "root_path": "", "headers": [], "query_string": b""})
    body = javascript_sdk(request).body.decode()
    assert "function mountLauncher" in body
    assert "mountLauncher(data.widget || {}" in body
    assert "translateX(-50%)" in WIDGET_LAUNCHER_JS
    assert "'Tap an option'" in WIDGET_LAUNCHER_JS
