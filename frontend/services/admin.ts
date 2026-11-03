import { apiFetch } from "./api";
import type { AdminBot, AdminUser, AuditEntry, Delivery, Overview } from "@/types/admin";

export const getOverview = () => apiFetch<Overview>("/admin/overview");
export const listAdminUsers = (q = "") => apiFetch<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}`);
export const createAdminUser = (payload: { name: string; email: string; password: string; role: "user" | "superadmin" }) =>
  apiFetch<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(payload) });
export const updateAdminUser = (id: string, payload: Partial<{ name: string; role: "user" | "superadmin"; is_active: boolean; password: string }>) =>
  apiFetch<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const deleteAdminUser = (id: string, transferTo?: string) =>
  apiFetch<void>(`/admin/users/${id}${transferTo ? `?transfer_to=${transferTo}` : ""}`, { method: "DELETE" });
export const listAdminBots = (q = "", status = "") => apiFetch<AdminBot[]>(`/admin/bots?q=${encodeURIComponent(q)}&status=${status}`);
export const updateAdminBot = (id: string, payload: Partial<{ status: AdminBot["status"]; owner_id: string }>) =>
  apiFetch<AdminBot>(`/admin/bots/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const listAudit = (limit = 100) => apiFetch<AuditEntry[]>(`/admin/audit?limit=${limit}`);
export const listDeliveries = (status = "") => apiFetch<Delivery[]>(`/admin/deliveries?status=${status}`);
export const retryDelivery = (id: string) => apiFetch<Delivery>(`/admin/deliveries/${id}/retry`, { method: "POST" });
