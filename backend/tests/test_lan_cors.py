import re

from app.config import Settings


def test_private_network_origins_are_accepted() -> None:
    pattern = re.compile(Settings(_env_file=None).cors_origin_regex)
    for origin in ("http://192.168.40.86:3000", "http://10.0.0.5:3000", "http://172.20.1.9:3000", "http://tony-pc.local:3000", "http://localhost:3000"):
        assert pattern.match(origin), origin
    for origin in ("http://evil.example.com", "http://8.8.8.8:3000", "https://192.168.1.1.example.com"):
        assert not pattern.match(origin), origin
