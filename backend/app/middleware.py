from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

from app.config import get_settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-ID", uuid4().hex)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin" if request.url.path.endswith(".js") else "same-site"
        if request.url.scheme == "https": response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class PublicRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, limit: int, window_seconds: int = 60) -> None:
        super().__init__(app)
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if not (path.startswith("/api/public/") or (path.startswith("/api/conversations/") and request.method == "POST")):
            return await call_next(request)
        address = request.client.host if request.client else "unknown"
        key = f"{address}:{path.split('/')[2:4]}"
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] <= now - self.window_seconds: bucket.popleft()
            if len(bucket) >= self.limit:
                retry_after = max(1, int(self.window_seconds - (now - bucket[0])))
                return JSONResponse({"detail": "Too many requests"}, status_code=429, headers={"Retry-After": str(retry_after)})
            bucket.append(now)
            if len(self._hits) > 10000:
                stale = [item for item, values in self._hits.items() if not values or values[-1] <= now - self.window_seconds]
                for item in stale: self._hits.pop(item, None)
        return await call_next(request)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        maximum = (get_settings().max_upload_size_mb + 1) * 1024 * 1024
        raw = request.headers.get("content-length")
        if raw:
            try:
                if int(raw) > maximum: return JSONResponse({"detail": "Request body is too large"}, status_code=413)
            except ValueError:
                return JSONResponse({"detail": "Invalid Content-Length header"}, status_code=400)
        return await call_next(request)
