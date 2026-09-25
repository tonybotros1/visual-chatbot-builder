import { apiFetch } from "./api";
import type { BotRecord, ValidationReport } from "@/types/api";

export const listBots = () => apiFetch<BotRecord[]>("/bots");
export const getBot = (botId: string) => apiFetch<BotRecord>(`/bots/${botId}`);
export const createBot = (name: string, description = "") =>
  apiFetch<BotRecord>("/bots", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
export const updateBot = (botId: string, updates: Partial<Pick<BotRecord, "name" | "description" | "status">>) =>
  apiFetch<BotRecord>(`/bots/${botId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
export const archiveBot = (botId: string) => apiFetch<void>(`/bots/${botId}`, { method: "DELETE" });
export const validateBot = (botId: string) =>
  apiFetch<ValidationReport>(`/bots/${botId}/validate`, { method: "POST" });
export const publishBot = (botId: string) =>
  apiFetch<{ bot: BotRecord; public_url: string; version: { version_number: number } }>(
    `/bots/${botId}/publish`,
    { method: "POST" },
  );

