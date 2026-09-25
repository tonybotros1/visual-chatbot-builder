import { apiFetch } from "./api";
import type { BotLocale } from "@/types/api";

export const listLocales = (botId: string) => apiFetch<BotLocale[]>(`/bots/${botId}/locales`);
export const createLocale = (botId: string, payload: { locale: string; name: string; direction: "ltr" | "rtl"; translations: Record<string, unknown>; is_default: boolean }) => apiFetch<BotLocale>(`/bots/${botId}/locales`, { method: "POST", body: JSON.stringify(payload) });
export const updateLocale = (botId: string, id: string, payload: Partial<Pick<BotLocale, "name" | "direction" | "translations" | "is_default">>) => apiFetch<BotLocale>(`/bots/${botId}/locales/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteLocale = (botId: string, id: string) => apiFetch<void>(`/bots/${botId}/locales/${id}`, { method: "DELETE" });
