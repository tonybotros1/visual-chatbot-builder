from types import SimpleNamespace
from uuid import uuid4

from app.api.routes.workspaces import can_manage_workspace


def test_only_the_creator_or_a_platform_admin_manages_a_workspace() -> None:
    creator = SimpleNamespace(id=uuid4(), role="user")
    other = SimpleNamespace(id=uuid4(), role="user")
    admin = SimpleNamespace(id=uuid4(), role="superadmin")
    assert can_manage_workspace(creator.id, creator)
    assert not can_manage_workspace(creator.id, other)
    assert can_manage_workspace(creator.id, admin)
