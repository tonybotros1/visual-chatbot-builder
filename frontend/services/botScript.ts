import { apiFetch } from "./api";
import type { FlowDocument } from "@/types/flow";

export type ScriptIssue = {
  severity: "error" | "warning";
  message: string;
  line: number | null;
  step: string | null;
};

export type ScriptCheck = {
  ok: boolean;
  issues: ScriptIssue[];
  languages: string[];
  name: string;
  steps: number;
  nodes: number;
  questions: number;
  /** Present only when the code has no errors. */
  flow: Pick<FlowDocument, "nodes" | "edges"> | null;
};

/** The writing rules for Bot Script (shown above the code box and handed to whoever writes the code). */
export const getScriptRules = () => apiFetch<{ rules: string; example: string }>("/bot-script/rules");

/** Read the code: every problem with its line number, and the flow it builds when there are no errors. */
export const checkScript = (code: string) =>
  apiFetch<ScriptCheck>("/bot-script/check", { method: "POST", body: JSON.stringify({ code }) });

/** Write a flow (the canvas as it is now) as code. */
export const exportScript = (flow: Pick<FlowDocument, "nodes" | "edges">, name: string) =>
  apiFetch<{ code: string; warnings: string[]; languages: string[] }>("/bot-script/export", {
    method: "POST",
    body: JSON.stringify({ flow, name }),
  });
