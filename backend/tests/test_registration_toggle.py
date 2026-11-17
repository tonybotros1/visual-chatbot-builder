from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes import auth
from app.schemas.auth import RegisterRequest


def test_registration_can_be_closed(monkeypatch) -> None:
    monkeypatch.setattr(auth, "get_settings", lambda: SimpleNamespace(allow_registration=False))
    assert auth.auth_options() == {"registration_open": False}
    with pytest.raises(HTTPException) as error:
        auth.register(RegisterRequest(name="New Person", email="new.person@example.com", password="a-long-password-1"), db=None)
    assert error.value.status_code == 403
    assert "closed" in error.value.detail


def test_registration_is_open_by_default(monkeypatch) -> None:
    monkeypatch.setattr(auth, "get_settings", lambda: SimpleNamespace(allow_registration=True))
    assert auth.auth_options() == {"registration_open": True}
