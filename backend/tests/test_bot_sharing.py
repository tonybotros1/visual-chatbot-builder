from app.api.routes.bots import resolve_role
from app.schemas.platform import merge_access


def test_private_mode_keeps_the_original_rules() -> None:
    assert resolve_role(is_owner=True, is_platform_admin=False, collaborator_role=None, sharing_mode="private") == "owner"
    assert resolve_role(is_owner=False, is_platform_admin=False, collaborator_role=None, sharing_mode="private") is None
    assert resolve_role(is_owner=False, is_platform_admin=False, collaborator_role="viewer", sharing_mode="private") == "viewer"


def test_shared_modes_grant_a_floor_without_lowering_invited_roles() -> None:
    assert resolve_role(is_owner=False, is_platform_admin=False, collaborator_role=None, sharing_mode="view") == "viewer"
    assert resolve_role(is_owner=False, is_platform_admin=False, collaborator_role=None, sharing_mode="edit") == "editor"
    assert resolve_role(is_owner=False, is_platform_admin=False, collaborator_role="admin", sharing_mode="view") == "admin"
    assert resolve_role(is_owner=False, is_platform_admin=False, collaborator_role="viewer", sharing_mode="edit") == "editor"


def test_platform_admins_manage_every_bot() -> None:
    assert resolve_role(is_owner=False, is_platform_admin=True, collaborator_role=None, sharing_mode="private") == "admin"


def test_access_settings_fall_back_to_private() -> None:
    assert merge_access(None) == {"bot_sharing": "private"}
    assert merge_access({"bot_sharing": "edit", "updated_by": "x"}) == {"bot_sharing": "edit"}
    assert merge_access({"bot_sharing": "everything"}) == {"bot_sharing": "private"}
