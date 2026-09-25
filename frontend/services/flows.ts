import type { FlowDocument } from "@/types/flow";
import { apiFetch } from "./api";

export async function loadFlow(botId: string): Promise<FlowDocument> {
  return apiFetch<FlowDocument>(`/bots/${botId}/flow`);
}

export async function saveFlow(botId: string, document: FlowDocument): Promise<FlowDocument> {
  return apiFetch<FlowDocument>(`/bots/${botId}/flow`, {
    method: "PUT",
    body: JSON.stringify(document),
  });
}
