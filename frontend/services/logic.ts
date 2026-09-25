import { apiFetch } from "./api";
import type { FactSchema } from "@/types/flow";
import type {
  LogicAssetRecord,
  LogicDraft,
  LogicKind,
  LogicPublishResponse,
  LogicVersion,
  ValidationReport,
} from "@/types/api";


export const listLogicAssets = (kind?: LogicKind) =>
  apiFetch<LogicAssetRecord[]>(`/logic-assets${kind ? `?kind=${kind}` : ""}`);

export const createLogicAsset = (kind: LogicKind, name: string, description = "") =>
  apiFetch<LogicAssetRecord>("/logic-assets", {
    method: "POST",
    body: JSON.stringify({ kind, name, description }),
  });

export const getLogicAsset = (assetId: string) =>
  apiFetch<LogicAssetRecord>(`/logic-assets/${assetId}`);

export const getLogicDraft = (assetId: string) =>
  apiFetch<LogicDraft>(`/logic-assets/${assetId}/draft`);

export const saveLogicDraft = (
  assetId: string,
  definition: Record<string, unknown>,
  inputSchema: FactSchema,
  outputSchema: FactSchema,
) => apiFetch<LogicDraft>(`/logic-assets/${assetId}/draft`, {
  method: "PUT",
  body: JSON.stringify({ definition, input_schema: inputSchema, output_schema: outputSchema }),
});

export const validateLogic = (assetId: string) =>
  apiFetch<ValidationReport>(`/logic-assets/${assetId}/validate`, { method: "POST" });

export const publishLogic = (assetId: string) =>
  apiFetch<LogicPublishResponse>(`/logic-assets/${assetId}/publish`, { method: "POST" });

export const listLogicVersions = (assetId: string) =>
  apiFetch<LogicVersion[]>(`/logic-assets/${assetId}/versions`);

export const evaluateLogic = (assetId: string, facts: Record<string, unknown>) =>
  apiFetch<{ outputs: Record<string, unknown>; matched: string[]; trace: Array<Record<string, unknown>> }>(`/logic-assets/${assetId}/evaluate`, {
    method: "POST",
    body: JSON.stringify({ facts }),
  });
