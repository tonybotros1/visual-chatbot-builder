import { apiFetch } from "./api";
import type { FactSchema, FlowDocument } from "@/types/flow";
import type {
  SubflowDraft,
  SubflowPublishResponse,
  SubflowRecord,
  SubflowVersion,
  ValidationReport,
} from "@/types/api";


export const listSubflows = () => apiFetch<SubflowRecord[]>("/subflows");

export const createSubflow = (name: string, description = "") =>
  apiFetch<SubflowRecord>("/subflows", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });

export const getSubflow = (subflowId: string) =>
  apiFetch<SubflowRecord>(`/subflows/${subflowId}`);

export const getSubflowDraft = (subflowId: string) =>
  apiFetch<SubflowDraft>(`/subflows/${subflowId}/draft`);

export const saveSubflowDraft = (
  subflowId: string,
  flowJson: FlowDocument,
  inputSchema: FactSchema,
  outputSchema: FactSchema,
) =>
  apiFetch<SubflowDraft>(`/subflows/${subflowId}/draft`, {
    method: "PUT",
    body: JSON.stringify({
      flow_json: flowJson,
      input_schema: inputSchema,
      output_schema: outputSchema,
    }),
  });

export const validateSubflow = (subflowId: string) =>
  apiFetch<ValidationReport>(`/subflows/${subflowId}/validate`, { method: "POST" });

export const publishSubflow = (subflowId: string) =>
  apiFetch<SubflowPublishResponse>(`/subflows/${subflowId}/publish`, { method: "POST" });

export const listSubflowVersions = (subflowId: string) =>
  apiFetch<SubflowVersion[]>(`/subflows/${subflowId}/versions`);
