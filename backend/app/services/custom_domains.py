"""Custom domains: a bot answered at the customer's own hostname (https://chat.example.com).

How it fits together on a hosted server:

1. The owner adds the hostname in the Share tab and creates a DNS record (a CNAME to this server's
   host, or an A record to its address).
2. "Verify" checks that the hostname now resolves to the same address as this server. No file to upload.
3. The reverse proxy asks `GET /api/public/domains/ask?domain=...` before it requests an HTTPS
   certificate, so certificates are only ever issued for hostnames registered here.
4. Every request that arrives on such a hostname is handed to `GET /api/public/domains/site`, which
   returns a small page that shows the bot's chat full screen.
"""

from __future__ import annotations

import html
import socket
from urllib.parse import urlparse

VERIFICATION_PATH = "/.well-known/visual-chatbot-builder-verification"


def addresses(hostname: str) -> set[str]:
    """Every address a hostname resolves to (CNAMEs followed); empty when it does not resolve."""
    try:
        return {item[4][0] for item in socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)}
    except (OSError, UnicodeError):
        return set()


def platform_host(public_url: str) -> str:
    """The hostname visitors use for this platform (from the admin's public address), or ''."""
    if not public_url:
        return ""
    return (urlparse(public_url if "://" in public_url else f"http://{public_url}").hostname or "").lower()


def points_here(hostname: str, public_url: str) -> bool:
    """True when the custom hostname resolves to an address this platform's own host resolves to."""
    host = platform_host(public_url)
    if not host or hostname == host:
        return False
    ours = addresses(host)
    return bool(ours and ours & addresses(hostname))


def request_host(headers) -> str:
    """The hostname the visitor typed: the proxy's X-Forwarded-Host, else Host; lower-case, no port."""
    raw = (headers.get("x-forwarded-host") or headers.get("host") or "").split(",")[0].strip().lower()
    if raw.startswith("["):  # an IPv6 literal is never a custom domain; leave it as is
        return raw
    return raw.split(":", 1)[0]


def chat_page(*, title: str, chat_url: str) -> str:
    """A full-window page that shows the bot's chat, so the address bar keeps the custom domain."""
    safe_title = html.escape(title, quote=True)
    safe_url = html.escape(chat_url, quote=True)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{safe_title}</title>
<style>
  html, body {{ margin: 0; height: 100%; background: #f5f3ee; }}
  iframe {{ display: block; width: 100%; height: 100vh; height: 100dvh; border: 0; }}
</style>
</head>
<body>
<iframe src="{safe_url}" title="{safe_title}" allow="clipboard-write; payment; geolocation"></iframe>
</body>
</html>
"""


def notice_page(*, title: str, message: str) -> str:
    """A plain page for a domain that is registered but cannot show a chat yet."""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title, quote=True)}</title>
<style>
  body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f3ee; color: #211d29; font: 16px/1.5 system-ui, sans-serif; }}
  main {{ max-width: 420px; padding: 32px; text-align: center; }}
  h1 {{ margin: 0 0 8px; font-size: 20px; }}
  p {{ margin: 0; color: #6b6475; }}
</style>
</head>
<body><main><h1>{html.escape(title)}</h1><p>{html.escape(message)}</p></main></body>
</html>
"""
