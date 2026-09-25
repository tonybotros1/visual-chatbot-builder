import { apiFetch } from "./api";
import type { BotAnalytics, BotTestScenario, ScenarioRun } from "@/types/api";


export const listScenarios = (botId: string) =>
  apiFetch<BotTestScenario[]>(`/bots/${botId}/tests`);

export const createScenario = (
  botId: string,
  name: string,
  answers: Record<string, unknown>,
  expected: Record<string, unknown>,
) => apiFetch<BotTestScenario>(`/bots/${botId}/tests`, {
  method: "POST",
  body: JSON.stringify({ name, answers, expected }),
});

export const runScenario = (botId: string, scenarioId: string) =>
  apiFetch<ScenarioRun>(`/bots/${botId}/tests/${scenarioId}/run`, { method: "POST" });

export const deleteScenario = (botId: string, scenarioId: string) =>
  apiFetch<void>(`/bots/${botId}/tests/${scenarioId}`, { method: "DELETE" });

export const getBotAnalytics = (botId: string) =>
  apiFetch<BotAnalytics>(`/bots/${botId}/analytics`);
