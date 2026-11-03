"""What we can learn about a visitor from the request that starts a conversation.

The chat page sends what the browser knows (page URL, referrer, language, time zone, screen) and the
server adds what only it can see: the client address, the parsed user agent, and a best-effort
location for public addresses. Everything is optional; lookups never fail a conversation start.
"""

from __future__ import annotations

import ipaddress
import json
import re
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import Request

GEO_ENDPOINT = "http://ip-api.com/json/{ip}?fields=status,country,countryCode,regionName,city,timezone"
GEO_TIMEOUT_SECONDS = 2.0
_geo_cache: dict[str, dict[str, Any]] = {}
_geo_lock = Lock()
_GEO_CACHE_LIMIT = 4096


def client_ip(request: Request) -> str | None:
    """The visitor's address: the first X-Forwarded-For hop behind a proxy, else the socket peer."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else None


def parse_user_agent(user_agent: str | None) -> dict[str, str]:
    """Browser, operating system and device class from a user-agent string (good enough for a results screen)."""
    ua = user_agent or ""
    lowered = ua.lower()
    if "ipad" in lowered or "tablet" in lowered or ("android" in lowered and "mobile" not in lowered):
        device = "tablet"
    elif "mobi" in lowered or "iphone" in lowered or "android" in lowered:
        device = "mobile"
    elif ua:
        device = "desktop"
    else:
        device = ""

    if "iphone" in lowered or "ipad" in lowered or "ipod" in lowered:
        os_name = "iOS"
    elif "android" in lowered:
        os_name = "Android"
    elif "windows" in lowered:
        os_name = "Windows"
    elif "mac os x" in lowered or "macintosh" in lowered:
        os_name = "macOS"
    elif "cros" in lowered:
        os_name = "ChromeOS"
    elif "linux" in lowered:
        os_name = "Linux"
    else:
        os_name = ""

    browser = ""
    for pattern, name in (
        (r"edg(?:e|a|ios)?/", "Edge"),
        (r"opr/|opera", "Opera"),
        (r"samsungbrowser/", "Samsung Internet"),
        (r"crios/", "Chrome"),
        (r"fxios/", "Firefox"),
        (r"chrome/", "Chrome"),
        (r"firefox/", "Firefox"),
        (r"safari/", "Safari"),
    ):
        if re.search(pattern, lowered):
            browser = name
            break
    return {"browser": browser, "os": os_name, "device": device}


def _is_public(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_global
    except ValueError:
        return False


def lookup_location(ip: str | None) -> dict[str, Any]:
    """Country, region, city and time zone for a public address; empty for private ones or when the lookup fails."""
    if not ip or not _is_public(ip):
        return {}
    with _geo_lock:
        cached = _geo_cache.get(ip)
    if cached is not None:
        return dict(cached)
    result: dict[str, Any] = {}
    try:
        # ip-api drops connections that carry a custom User-Agent; the default urllib one is accepted.
        with urlopen(UrlRequest(GEO_ENDPOINT.format(ip=ip)), timeout=GEO_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8", "replace"))
        if payload.get("status") == "success":
            result = {
                "country": payload.get("country") or "",
                "country_code": payload.get("countryCode") or "",
                "region": payload.get("regionName") or "",
                "city": payload.get("city") or "",
                "ip_timezone": payload.get("timezone") or "",
            }
    except (HTTPError, URLError, TimeoutError, ValueError, OSError):
        result = {}
    # Only successful answers are remembered, so a hiccup does not blank an address for good.
    if result:
        with _geo_lock:
            if len(_geo_cache) >= _GEO_CACHE_LIMIT:
                _geo_cache.clear()
            _geo_cache[ip] = dict(result)
    return result


def visitor_context(request: Request | None, *, locate: bool = True) -> dict[str, Any]:
    """Server-side visitor details to merge into a conversation's metadata."""
    if request is None:
        return {}
    ip = client_ip(request)
    user_agent = request.headers.get("user-agent", "")
    context: dict[str, Any] = {"ip": ip or "", "user_agent": user_agent[:512], **parse_user_agent(user_agent)}
    accept_language = request.headers.get("accept-language", "")
    if accept_language:
        context["accept_language"] = accept_language.split(",")[0].strip()[:20]
    if locate:
        context.update(lookup_location(ip))
    return {key: value for key, value in context.items() if value not in (None, "")}
