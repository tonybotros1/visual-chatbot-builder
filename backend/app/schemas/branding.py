import re

from pydantic import BaseModel, Field, field_validator

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")

DEFAULT_BRANDING: dict[str, str] = {
    "primary_color": "#00A1B0",
    "secondary_color": "#7C3AED",
}


def _hex(value: str) -> str:
    value = value.strip()
    if not HEX_COLOR.match(value):
        raise ValueError("Use a six-digit hex colour such as #00A1B0")
    return value.upper()


class BrandingUpdate(BaseModel):
    """Platform-wide colours. The primary drives buttons, links, focus and hover states across the
    builder and the admin console; the secondary colours logic and component nodes and other accents."""

    primary_color: str = Field(min_length=7, max_length=7)
    secondary_color: str = Field(min_length=7, max_length=7)

    @field_validator("primary_color", "secondary_color")
    @classmethod
    def check_hex(cls, value: str) -> str:
        return _hex(value)


class BrandingRead(BaseModel):
    primary_color: str
    secondary_color: str


def merge_branding(stored: dict | None) -> dict[str, str]:
    """Stored values over the defaults, ignoring anything that is not a valid colour."""
    result = dict(DEFAULT_BRANDING)
    for key in result:
        candidate = (stored or {}).get(key)
        if isinstance(candidate, str) and HEX_COLOR.match(candidate.strip()):
            result[key] = candidate.strip().upper()
    return result
