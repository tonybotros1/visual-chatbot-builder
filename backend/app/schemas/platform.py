from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator

BotSharing = Literal["private", "view", "edit"]

DEFAULT_ACCESS: dict[str, str] = {
    # private: owners and invited collaborators only (the original behaviour).
    # view: every active account can open and test every bot; edit: every account can also change them.
    # Owner-only actions (rename, archive, move between workspaces, delete) stay with the owner and platform admins.
    "bot_sharing": "private",
}


class AccessRead(BaseModel):
    bot_sharing: BotSharing


class AccessUpdate(BaseModel):
    bot_sharing: BotSharing


def normalize_public_url(value: str) -> str:
    """An origin such as http://192.168.40.86:3000 (scheme + host[:port]); empty means "follow the page address"."""
    value = value.strip().rstrip("/")
    if not value:
        return ""
    parsed = urlparse(value if "://" in value else f"http://{value}")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("Enter an address like http://192.168.40.86:3000 or https://bots.example.com")
    return f"{parsed.scheme}://{parsed.netloc}"


class SiteRead(BaseModel):
    public_url: str = ""


class SiteUpdate(BaseModel):
    public_url: str = ""

    @field_validator("public_url")
    @classmethod
    def check_url(cls, value: str) -> str:
        return normalize_public_url(value)


def merge_site(stored: dict | None) -> dict[str, str]:
    candidate = (stored or {}).get("public_url", "")
    try:
        return {"public_url": normalize_public_url(candidate) if isinstance(candidate, str) else ""}
    except ValueError:
        return {"public_url": ""}


def merge_access(stored: dict | None) -> dict[str, str]:
    result = dict(DEFAULT_ACCESS)
    candidate = (stored or {}).get("bot_sharing")
    if candidate in {"private", "view", "edit"}:
        result["bot_sharing"] = candidate
    return result
