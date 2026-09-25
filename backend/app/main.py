from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import get_settings
from app.database.seed import seed_development_data
from app.database.session import SessionLocal
from app.middleware import PublicRateLimitMiddleware, RequestSizeLimitMiddleware, SecurityHeadersMiddleware


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    with SessionLocal() as session:
        seed_development_data(session)
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(PublicRateLimitMiddleware, limit=settings.public_rate_limit_per_minute)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"name": settings.app_name, "docs": "/docs"}
