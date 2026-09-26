from app.api.routes.integrations import _validate_config
from app.services.integrations import _notification_filters_match, _notification_payload, validate_webhook_url
from app.services.secret_vault import decrypt_secrets, encrypt_secrets


def test_secret_vault_round_trip() -> None:
    encrypted = encrypt_secrets({"token": "very-secret"})
    assert b"very-secret" not in encrypted
    assert decrypt_secrets(encrypted) == {"token": "very-secret"}


def test_webhook_url_rejects_private_destinations() -> None:
    for url in ("http://example.com/hook", "https://localhost/hook", "https://127.0.0.1/hook"):
        try:
            validate_webhook_url(url)
        except ValueError:
            continue
        raise AssertionError(f"Expected private URL rejection: {url}")


def test_webhook_url_accepts_public_https() -> None:
    assert validate_webhook_url("https://hooks.example.com/events") == "https://hooks.example.com/events"


def test_sms_sandbox_does_not_require_a_remote_url() -> None:
    _validate_config("sms", {"mode": "sandbox"})


def test_notification_filters_require_every_configured_rule() -> None:
    settings = {
        "notification_filters": [
            {"variable": "language", "operator": "equals", "value": "English"},
            {"variable": "interests", "operator": "contains", "value": "Support"},
            {"variable": "status", "operator": "not_equals", "value": "closed"},
        ]
    }
    assert _notification_filters_match(
        settings,
        {"language": "english", "interests": ["Patient Support", "Education"], "status": "open"},
    )
    assert not _notification_filters_match(settings, {"language": "Arabic", "interests": ["Support"], "status": "open"})


def test_notification_payload_uses_saved_overrides() -> None:
    payload = _notification_payload(
        {
            "notification_from_email": "notifications@example.com",
            "notification_to_emails": ["team@example.com", "owner@example.com"],
            "notification_subject": "New response",
            "notification_subject_append": "chatbot_title",
            "notification_reply_to_variable": "email",
        },
        {"appearance": {"title": "Patient support"}},
    )
    assert payload["to_emails"] == ["team@example.com", "owner@example.com"]
    assert payload["chatbot_title"] == "Patient support"
    assert payload["reply_to_variable"] == "email"
