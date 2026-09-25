import { apiFetch } from "./api";
import type { AuditLogRecord, BotCollaborator } from "@/types/api";

export const listCollaborators = (botId: string) => apiFetch<BotCollaborator[]>(`/bots/${botId}/collaborators`);
export const inviteCollaborator = (botId: string, email: string, role: "admin" | "editor" | "viewer") => apiFetch<BotCollaborator>(`/bots/${botId}/collaborators`, { method: "POST", body: JSON.stringify({ email, role }) });
export const updateCollaborator = (botId: string, id: string, role: "admin" | "editor" | "viewer") => apiFetch<BotCollaborator>(`/bots/${botId}/collaborators/${id}`, { method: "PUT", body: JSON.stringify({ role }) });
export const removeCollaborator = (botId: string, id: string) => apiFetch<void>(`/bots/${botId}/collaborators/${id}`, { method: "DELETE" });
export const listAuditLog = (botId: string) => apiFetch<AuditLogRecord[]>(`/bots/${botId}/audit-log`);
