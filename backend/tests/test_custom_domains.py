from app.services import custom_domains
from app.services.custom_domains import VERIFICATION_PATH, chat_page, notice_page, platform_host, points_here, request_host


def _fake_dns(table):
    def getaddrinfo(host, *_args, **_kwargs):
        if host not in table:
            raise OSError("no such host")
        return [(None, None, None, "", (address, 0)) for address in table[host]]
    return getaddrinfo


def test_platform_host_comes_from_the_public_address() -> None:
    assert platform_host("https://ysman.dyndns.info/spaghetti") == "ysman.dyndns.info"
    assert platform_host("http://192.168.40.86:3000") == "192.168.40.86"
    assert platform_host("") == ""


def test_domain_is_verified_only_when_it_points_at_this_server(monkeypatch) -> None:
    monkeypatch.setattr(custom_domains.socket, "getaddrinfo", _fake_dns({
        "platform.example.net": ["203.0.113.10"],
        "chat.customer.com": ["203.0.113.10"],
        "elsewhere.customer.com": ["198.51.100.7"],
    }))
    site = "https://platform.example.net/spaghetti"
    assert points_here("chat.customer.com", site) is True
    assert points_here("elsewhere.customer.com", site) is False
    assert points_here("unresolved.customer.com", site) is False
    assert points_here("platform.example.net", site) is False  # the platform itself is not a custom domain
    assert points_here("chat.customer.com", "") is False


def test_request_host_prefers_the_forwarded_host() -> None:
    assert request_host({"x-forwarded-host": "Chat.Customer.com:443", "host": "spaghetti-api:8000"}) == "chat.customer.com"
    assert request_host({"host": "chat.customer.com"}) == "chat.customer.com"
    assert request_host({}) == ""


def test_pages_escape_what_they_show() -> None:
    page = chat_page(title='Bot "<script>"', chat_url="https://platform.example.net/spaghetti/chat/my-bot")
    assert "<script>" not in page.split("<style>")[0]
    assert 'src="https://platform.example.net/spaghetti/chat/my-bot"' in page
    assert "100dvh" in page
    assert "&lt;b&gt;" in notice_page(title="<b>", message="x")
    assert VERIFICATION_PATH.startswith("/.well-known/")
