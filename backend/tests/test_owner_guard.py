from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.admin import guard_owner


def _user(is_owner: bool):
    return SimpleNamespace(id=uuid4(), is_owner=is_owner)


def test_owner_role_and_access_are_locked_for_everyone() -> None:
    owner = _user(True)
    for values in ({"role": "user"}, {"is_active": False}, {"role": "superadmin", "name": "x"}):
        with pytest.raises(HTTPException) as caught:
            guard_owner(owner, owner, values)
        assert caught.value.status_code == 403


def test_only_the_owner_edits_their_own_name_or_password() -> None:
    owner = _user(True)
    other_admin = _user(False)
    with pytest.raises(HTTPException):
        guard_owner(owner, other_admin, {"password": "new-password-123"})
    guard_owner(owner, owner, {"password": "new-password-123"})  # allowed
    guard_owner(other_admin, owner, {"role": "user", "is_active": False})  # ordinary accounts are unaffected
