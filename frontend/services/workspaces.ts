import { apiFetch } from "./api";
import type { WorkspaceRecord } from "@/types/api";

export const listWorkspaces = () => apiFetch<WorkspaceRecord[]>("/workspaces");
export const createWorkspace = (name: string, description = "") =>
  apiFetch<WorkspaceRecord>("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
export const updateWorkspace = (workspaceId: string, updates: Partial<Pick<WorkspaceRecord, "name" | "description" | "position">>) =>
  apiFetch<WorkspaceRecord>(`/workspaces/${workspaceId}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
export const deleteWorkspace = (workspaceId: string) => apiFetch<void>(`/workspaces/${workspaceId}`, { method: "DELETE" });
