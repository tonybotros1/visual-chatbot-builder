import { apiFetch } from "./api";
import type { EventSubscription, IntegrationConnection, IntegrationDelivery } from "@/types/api";

export const listIntegrations = () => apiFetch<IntegrationConnection[]>("/integrations");
export const createIntegration = (payload: { kind: IntegrationConnection["kind"]; name: string; config: Record<string, unknown>; secrets: Record<string, string> }) =>
  apiFetch<IntegrationConnection>("/integrations", { method: "POST", body: JSON.stringify(payload) });
export const updateIntegration = (id: string, payload: Partial<Pick<IntegrationConnection, "name" | "config" | "status">> & { secrets?: Record<string, string> }) =>
  apiFetch<IntegrationConnection>(`/integrations/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const disableIntegration = (id: string) => apiFetch<void>(`/integrations/${id}`, { method: "DELETE" });
export const listSubscriptions = (botId: string) => apiFetch<EventSubscription[]>(`/integrations/bots/${botId}/subscriptions`);
export const subscribeIntegration = (botId: string, connectionId: string, event: EventSubscription["event"]) =>
  apiFetch<EventSubscription>(`/integrations/bots/${botId}/subscriptions`, { method: "POST", body: JSON.stringify({ connection_id: connectionId, event }) });
export const deleteSubscription = (id: string) => apiFetch<void>(`/integrations/subscriptions/${id}`, { method: "DELETE" });
export const listDeliveries = () => apiFetch<IntegrationDelivery[]>("/integrations/deliveries");
export const retryDelivery = (id: string) => apiFetch<IntegrationDelivery>(`/integrations/deliveries/${id}/retry`, { method: "POST" });
