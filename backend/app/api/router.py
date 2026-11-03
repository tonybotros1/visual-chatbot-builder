from fastapi import APIRouter

from app.api.routes import admin, auth, bots, branding, conversations, platform, short_links, deployments, flows, health, integrations, localization, logic, providers, quality, subflows, teams, workspaces


api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(bots.router, prefix="/bots", tags=["bots"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(branding.router, prefix="/branding", tags=["branding"])
api_router.include_router(platform.router, prefix="/platform", tags=["platform"])
api_router.include_router(flows.router, prefix="/bots", tags=["flows"])
api_router.include_router(subflows.router, prefix="/subflows", tags=["subflows"])
api_router.include_router(logic.router, prefix="/logic-assets", tags=["logic"])
api_router.include_router(quality.router, prefix="/bots", tags=["quality"])
api_router.include_router(teams.router, prefix="/bots", tags=["teams"])
api_router.include_router(localization.router, prefix="/bots", tags=["localization"])
api_router.include_router(deployments.router, tags=["deployments"])
api_router.include_router(integrations.router, prefix="/integrations", tags=["integrations"])
api_router.include_router(conversations.router, tags=["conversations"])
api_router.include_router(conversations.public_router, prefix="/public", tags=["public"])
api_router.include_router(deployments.public_router, prefix="/public", tags=["public-deployments"])
api_router.include_router(short_links.router, prefix="/public", tags=["public-links"])
api_router.include_router(providers.router, prefix="/public/provider-actions", tags=["public-providers"])
