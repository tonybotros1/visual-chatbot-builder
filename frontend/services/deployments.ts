import { apiFetch } from "./api";
import type { CustomDomain, DeploymentMode, DeploymentRecord, TargetSegment } from "@/types/api";

export const listSegments = () => apiFetch<TargetSegment[]>("/target-segments");
export const createSegment = (name: string, rules: Record<string, unknown>) =>
  apiFetch<TargetSegment>("/target-segments", { method: "POST", body: JSON.stringify({ name, rules }) });
export const updateSegment = (id: string, payload: Partial<Pick<TargetSegment, "name" | "rules" | "status">>) =>
  apiFetch<TargetSegment>(`/target-segments/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteSegment = (id: string) => apiFetch<void>(`/target-segments/${id}`, { method: "DELETE" });

export const listDeployments = (botId: string) => apiFetch<DeploymentRecord[]>(`/bots/${botId}/deployments`);
export const createDeployment = (
  botId: string,
  payload: {
    name: string;
    mode: DeploymentMode;
    environment: DeploymentRecord["environment"];
    target_segment_id: string | null;
    config: Record<string, unknown>;
    rules: Record<string, unknown>;
  },
) => apiFetch<DeploymentRecord>(`/bots/${botId}/deployments`, { method: "POST", body: JSON.stringify(payload) });
export const updateDeployment = (id: string, payload: Partial<Omit<DeploymentRecord, "id" | "bot_id" | "bot_version_id" | "deployment_key" | "created_at" | "updated_at">>) =>
  apiFetch<DeploymentRecord>(`/deployments/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const refreshDeploymentVersion = (id: string) => apiFetch<DeploymentRecord>(`/deployments/${id}/refresh-version`, { method: "POST" });
export const deleteDeployment = (id: string) => apiFetch<void>(`/deployments/${id}`, { method: "DELETE" });
export const listDomains = (botId: string) => apiFetch<CustomDomain[]>(`/bots/${botId}/domains`);
export const createDomain = (deploymentId: string, hostname: string) => apiFetch<CustomDomain>(`/deployments/${deploymentId}/domains`, { method: "POST", body: JSON.stringify({ hostname }) });
export const verifyDomain = (id: string) => apiFetch<CustomDomain>(`/domains/${id}/verify`, { method: "POST" });
export const deleteDomain = (id: string) => apiFetch<void>(`/domains/${id}`, { method: "DELETE" });
