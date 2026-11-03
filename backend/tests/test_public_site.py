import pytest

from app.schemas.platform import SiteUpdate, merge_site, normalize_public_url


def test_public_url_is_reduced_to_an_origin() -> None:
    assert normalize_public_url("http://192.168.40.86:3000/") == "http://192.168.40.86:3000"
    assert normalize_public_url("bots.example.com") == "http://bots.example.com"
    assert normalize_public_url("  ") == ""
    for bad in ("http://host/path", "ftp://host", "http://host?x=1"):
        with pytest.raises(ValueError):
            normalize_public_url(bad)
    with pytest.raises(ValueError):
        SiteUpdate(public_url="http://host/chat")


def test_broken_stored_values_fall_back_to_following_the_page() -> None:
    assert merge_site({"public_url": "nonsense/path"}) == {"public_url": ""}
    assert merge_site(None) == {"public_url": ""}
