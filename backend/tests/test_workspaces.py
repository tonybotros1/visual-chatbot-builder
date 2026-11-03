from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.bot import BotUpdate
from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate


def test_workspace_names_are_trimmed_and_required() -> None:
    assert WorkspaceCreate(name="  Patient   programs ").name == "Patient programs"
    with pytest.raises(ValidationError):
        WorkspaceCreate(name="   ")
    with pytest.raises(ValidationError):
        WorkspaceCreate(name="x" * 121)
    assert WorkspaceUpdate(name=None).name is None
    assert WorkspaceUpdate(name=" KSA ").name == "KSA"


def test_bot_update_distinguishes_unset_workspace_from_null() -> None:
    # Leaving the field out keeps the current workspace; an explicit null moves the bot to unsorted.
    untouched = BotUpdate(name="Renamed")
    assert "workspace_id" not in untouched.model_fields_set
    cleared = BotUpdate(workspace_id=None)
    assert "workspace_id" in cleared.model_fields_set and cleared.workspace_id is None
    target = uuid4()
    assert BotUpdate(workspace_id=target).workspace_id == target
