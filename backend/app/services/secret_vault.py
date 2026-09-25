import base64
import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


def _cipher() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(get_settings().secret_key.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_secrets(values: dict[str, str]) -> bytes:
    clean = {str(key): str(value) for key, value in values.items() if str(value)}
    return _cipher().encrypt(json.dumps(clean).encode("utf-8")) if clean else b""


def decrypt_secrets(value: bytes | None) -> dict[str, str]:
    if not value:
        return {}
    try:
        decoded = _cipher().decrypt(value)
    except InvalidToken as exc:
        raise ValueError("Stored integration credentials cannot be decrypted") from exc
    data = json.loads(decoded)
    return {str(key): str(item) for key, item in data.items()}
