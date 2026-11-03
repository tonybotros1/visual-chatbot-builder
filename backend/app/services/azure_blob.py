"""Azure Blob Storage over its REST API with Shared Key authentication.

No SDK: the backend already signs S3 requests by hand, and the Blob API needs only four calls
(create container, put/get/delete blob). Credentials come either from platform settings
(AZURE_STORAGE_*), which makes Azure the default store for every upload, or from a per-bot
"storage" integration connection whose config says provider "azure".
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.config import Settings, get_settings
from app.engine.executor import EngineError

API_VERSION = "2023-11-03"
DEFAULT_CONTAINER = "spaghetti-uploads"
DEFAULT_ENDPOINT_SUFFIX = "core.windows.net"

_ACCOUNT_RE = re.compile(r"^[a-z0-9]{3,24}$")
_CONTAINER_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$")
_SUFFIX_RE = re.compile(r"^[a-z0-9.-]+$")

# Containers created (or confirmed) by this process, so uploads do not re-check on every file.
_ready_containers: set[tuple[str, str]] = set()


@dataclass(frozen=True)
class AzureBlobConfig:
    account: str
    key: str
    container: str = DEFAULT_CONTAINER
    endpoint_suffix: str = DEFAULT_ENDPOINT_SUFFIX

    def validate(self) -> "AzureBlobConfig":
        if not _ACCOUNT_RE.match(self.account):
            raise EngineError("Azure storage account name must be 3-24 lowercase letters or digits")
        if not _CONTAINER_RE.match(self.container):
            raise EngineError("Azure container name must be 3-63 lowercase letters, digits or dashes")
        if not _SUFFIX_RE.match(self.endpoint_suffix):
            raise EngineError("Azure endpoint suffix is invalid")
        try:
            base64.b64decode(self.key, validate=True)
        except ValueError as exc:
            raise EngineError("Azure storage account key must be base64") from exc
        return self

    @property
    def base_url(self) -> str:
        return f"https://{self.account}.blob.{self.endpoint_suffix}"


def parse_connection_string(value: str) -> dict[str, str]:
    """Split `Key=Value;Key=Value` (values may themselves contain `=`, as base64 keys do)."""
    parts: dict[str, str] = {}
    for chunk in value.split(";"):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        name, raw = chunk.split("=", 1)
        parts[name.strip()] = raw.strip()
    return parts


def config_from_settings(settings: Settings | None = None) -> AzureBlobConfig | None:
    """Platform-wide Azure storage, or None when it is not configured (uploads then stay on disk)."""
    settings = settings or get_settings()
    account = settings.azure_storage_account_name.strip()
    key = settings.azure_storage_account_key.strip()
    suffix = settings.azure_storage_endpoint_suffix.strip() or DEFAULT_ENDPOINT_SUFFIX
    if settings.azure_storage_connection_string.strip():
        parts = parse_connection_string(settings.azure_storage_connection_string)
        account = parts.get("AccountName", account)
        key = parts.get("AccountKey", key)
        suffix = parts.get("EndpointSuffix", suffix)
    if not account or not key:
        return None
    container = settings.azure_storage_container.strip() or DEFAULT_CONTAINER
    return AzureBlobConfig(account=account.lower(), key=key, container=container.lower(), endpoint_suffix=suffix.lower()).validate()


def config_from_connection(config: dict, secrets: dict) -> AzureBlobConfig:
    """A per-bot storage connection: config {account, container, endpoint_suffix}, secrets {account_key}."""
    account = str(config.get("account") or config.get("account_name") or "").strip().lower()
    key = str(secrets.get("account_key") or secrets.get("key") or "").strip()
    if not account or not key:
        raise EngineError("Azure storage needs an account name and an account_key secret")
    container = str(config.get("container") or DEFAULT_CONTAINER).strip().lower()
    suffix = str(config.get("endpoint_suffix") or DEFAULT_ENDPOINT_SUFFIX).strip().lower()
    return AzureBlobConfig(account=account, key=key, container=container, endpoint_suffix=suffix).validate()


def string_to_sign(method: str, account: str, resource_path: str, headers: dict[str, str], query: dict[str, str]) -> str:
    """Shared Key (2015-02-21+) string to sign. `resource_path` is the encoded `/container/blob` path."""
    lower = {name.lower(): value for name, value in headers.items()}
    content_length = lower.get("content-length", "")
    if content_length == "0":
        content_length = ""
    canonical_headers = "".join(f"{name}:{lower[name]}\n" for name in sorted(lower) if name.startswith("x-ms-"))
    canonical_resource = f"/{account}{resource_path}" + "".join(f"\n{name.lower()}:{query[name]}" for name in sorted(query, key=str.lower))
    return "\n".join([
        method.upper(),
        lower.get("content-encoding", ""),
        lower.get("content-language", ""),
        content_length,
        lower.get("content-md5", ""),
        lower.get("content-type", ""),
        "",  # Date: x-ms-date is used instead
        lower.get("if-modified-since", ""),
        lower.get("if-match", ""),
        lower.get("if-none-match", ""),
        lower.get("if-unmodified-since", ""),
        lower.get("range", ""),
        canonical_headers + canonical_resource,
    ])


def shared_key_signature(key: str, text: str) -> str:
    digest = hmac.new(base64.b64decode(key), text.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


class AzureBlobClient:
    def __init__(self, config: AzureBlobConfig):
        self.config = config

    def _request(self, method: str, resource_path: str, *, query: dict[str, str] | None = None, body: bytes = b"", extra_headers: dict[str, str] | None = None, ok: set[int] | None = None) -> bytes:
        query = query or {}
        headers = {
            "x-ms-date": datetime.now(UTC).strftime("%a, %d %b %Y %H:%M:%S GMT"),
            "x-ms-version": API_VERSION,
            **(extra_headers or {}),
        }
        if method in {"PUT", "POST"}:
            headers["Content-Length"] = str(len(body))
            # urllib adds a form Content-Type to any request with a body; sign an explicit one instead.
            headers.setdefault("Content-Type", "application/octet-stream")
        text = string_to_sign(method, self.config.account, resource_path, headers, query)
        headers["Authorization"] = f"SharedKey {self.config.account}:{shared_key_signature(self.config.key, text)}"
        url = self.config.base_url + resource_path
        if query:
            url += "?" + "&".join(f"{quote(name, safe='')}={quote(value, safe='')}" for name, value in query.items())
        request = Request(url, method=method, headers={k: v for k, v in headers.items() if k != "Content-Length"}, data=body if method in {"PUT", "POST"} else None)
        try:
            with urlopen(request, timeout=30) as response:
                return response.read()
        except HTTPError as exc:
            if ok and exc.code in ok:
                return b""
            detail = exc.read(1200).decode("utf-8", errors="replace")
            raise EngineError(f"Azure storage returned HTTP {exc.code}: {detail[:600]}") from exc
        except URLError as exc:
            raise EngineError(f"Azure storage connection failed: {exc.reason}") from exc

    def _blob_path(self, blob_name: str) -> str:
        blob_name = blob_name.strip("/")
        if not blob_name or ".." in blob_name.split("/"):
            raise EngineError("Invalid storage key")
        return f"/{self.config.container}/{quote(blob_name, safe='/~-._')}"

    def ensure_container(self) -> None:
        marker = (self.config.account, self.config.container)
        if marker in _ready_containers:
            return
        # Private container (no public access header); 409 means it already exists.
        self._request("PUT", f"/{self.config.container}", query={"restype": "container"}, ok={409})
        _ready_containers.add(marker)

    def upload(self, blob_name: str, content: bytes, content_type: str = "application/octet-stream") -> None:
        self.ensure_container()
        self._request("PUT", self._blob_path(blob_name), body=content, extra_headers={"x-ms-blob-type": "BlockBlob", "Content-Type": content_type or "application/octet-stream"})

    def download(self, blob_name: str) -> bytes:
        return self._request("GET", self._blob_path(blob_name))

    def delete(self, blob_name: str) -> None:
        self._request("DELETE", self._blob_path(blob_name), ok={404})


def platform_client() -> AzureBlobClient | None:
    config = config_from_settings()
    return AzureBlobClient(config) if config else None
