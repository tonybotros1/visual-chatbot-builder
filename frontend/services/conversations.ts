import { apiBaseUrl, apiFetch, getToken } from "./api";
import type { ConversationRecord, ConversationState, DeploymentBootstrap } from "@/types/api";

export const startPreview = (botId: string, locale?: string) =>
  apiFetch<ConversationState>(`/bots/${botId}/preview/start`, {
    method: "POST",
    body: JSON.stringify({ locale }),
  });
export const startPublic = (identifier: string, locale?: string) =>
  apiFetch<ConversationState>(`/public/${identifier}/start`, {
    method: "POST",
    body: JSON.stringify({ locale }),
  });
export const deploymentBootstrap = (deploymentKey: string) => {
  const query = new URLSearchParams({
    url: typeof window === "undefined" ? "" : window.location.href,
    referrer: typeof document === "undefined" ? "" : document.referrer,
    language: typeof navigator === "undefined" ? "" : navigator.language,
  });
  return apiFetch<DeploymentBootstrap>(`/public/deployments/${deploymentKey}/bootstrap?${query}`);
};
export const startDeployment = (deploymentKey: string, locale: string | undefined, deploymentToken: string) =>
  apiFetch<ConversationState>(`/public/deployments/${deploymentKey}/start`, {
    method: "POST",
    body: JSON.stringify({ locale, deployment_token: deploymentToken }),
  });
export const answerConversation = (conversationId: string, nodeId: string, value: unknown) =>
  apiFetch<ConversationState>(`/conversations/${conversationId}/answer`, {
    method: "POST",
    body: JSON.stringify({ node_id: nodeId, value }),
  });
export const listResponses = (botId: string) =>
  apiFetch<ConversationRecord[]>(`/bots/${botId}/responses`);
export const getConversation = (conversationId: string) =>
  apiFetch<ConversationRecord>(`/conversations/${conversationId}`);
export const updateConversation = (conversationId: string, payload: { status?: string; tags?: string[]; note?: string }) =>
  apiFetch<ConversationRecord>(`/conversations/${conversationId}`, { method: "PATCH", body: JSON.stringify(payload) });
export async function downloadResponses(botId: string, format: "csv" | "json" | "xlsx") {
  const response = await fetch(`${apiBaseUrl()}/bots/${botId}/responses/export?format=${format}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `responses.${format}`;
  link.click();
  URL.revokeObjectURL(link.href);
}
