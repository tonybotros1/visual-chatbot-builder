from app.api.routes.integrations import _validate_config
from app.services.integrations import validate_webhook_url
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
