import pytest
from pydantic import ValidationError

from app.schemas.branding import DEFAULT_BRANDING, BrandingUpdate, merge_branding


def test_colours_must_be_six_digit_hex() -> None:
    assert BrandingUpdate(primary_color="#00a1b0", secondary_color="#7C3AED").primary_color == "#00A1B0"
    for bad in ("00A1B00", "#00A1B", "#GGGGGG", "teal123", ""):
        with pytest.raises(ValidationError):
            BrandingUpdate(primary_color=bad, secondary_color="#7C3AED")


def test_merge_keeps_defaults_for_missing_or_broken_values() -> None:
    assert merge_branding(None) == DEFAULT_BRANDING
    merged = merge_branding({"primary_color": "#123abc", "secondary_color": "nope", "updated_by": "someone"})
    assert merged == {"primary_color": "#123ABC", "secondary_color": DEFAULT_BRANDING["secondary_color"]}
