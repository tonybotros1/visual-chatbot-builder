import { apiFetch, clearToken, setToken } from "@/lib/api";
import type { AdminBot, AdminUser, AuditEntry, Delivery, Overview, SessionUser } from "@/lib/types";

export async function login(email: string, password: string): Promise<SessionUser> {
  const result = await apiFetch<{ access_token: string; user: SessionUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (result.user.role !== "superadmin") throw new Error("This console is for platform administrators only.");
  setToken(result.access_token);
  return result.user;
}

export function logout() {
  clearToken();
}

export const currentUser = () => apiFetch<SessionUser>("/auth/me");
export const getOverview = () => apiFetch<Overview>("/admin/overview");
export const listUsers = (q = "") => apiFetch<AdminUser[]>(`/admin/users?q=${encodeURIComponent(q)}`);
export const createUser = (payload: { name: string; email: string; password: string; role: "user" | "superadmin" }) =>
  apiFetch<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(payload) });
export const updateUser = (id: string, payload: Partial<{ name: string; role: "user" | "superadmin"; is_active: boolean; password: string }>) =>
  apiFetch<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const deleteUser = (id: string, transferTo?: string) =>
  apiFetch<void>(`/admin/users/${id}${transferTo ? `?transfer_to=${transferTo}` : ""}`, { method: "DELETE" });
export const listBots = (q = "", status = "") => apiFetch<AdminBot[]>(`/admin/bots?q=${encodeURIComponent(q)}&status=${status}`);
export const updateBot = (id: string, payload: Partial<{ status: AdminBot["status"]; owner_id: string }>) =>
  apiFetch<AdminBot>(`/admin/bots/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const listAudit = (limit = 100) => apiFetch<AuditEntry[]>(`/admin/audit?limit=${limit}`);
export const listDeliveries = (status = "") => apiFetch<Delivery[]>(`/admin/deliveries?status=${status}`);
export const retryDelivery = (id: string) => apiFetch<Delivery>(`/admin/deliveries/${id}/retry`, { method: "POST" });
