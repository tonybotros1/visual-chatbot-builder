import { apiFetch } from "./api";

export type BotSharing = "private" | "view" | "edit";
export type AccessSettings = { bot_sharing: BotSharing };

export type SiteSettings = { public_url: string };

export const getSiteSettings = () => apiFetch<SiteSettings>("/platform/site");
export const updateSiteSettings = (settings: SiteSettings) =>
  apiFetch<SiteSettings>("/platform/site", { method: "PUT", body: JSON.stringify(settings) });

export const getAccessSettings = () => apiFetch<AccessSettings>("/platform/access");
export const updateAccessSettings = (settings: AccessSettings) =>
  apiFetch<AccessSettings>("/platform/access", { method: "PUT", body: JSON.stringify(settings) });
