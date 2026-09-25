"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, ChevronLeft, FlaskConical, Play, Plus, Trash2 } from "lucide-react";
import { getBot } from "@/services/bots";
import { createScenario, deleteScenario, getBotAnalytics, listScenarios, runScenario } from "@/services/quality";
import type { BotAnalytics, BotTestScenario, ScenarioRun } from "@/types/api";


export function QualityWorkspace({ botId }: { botId: string }) {
  const router = useRouter();
  const [botName, setBotName] = useState("Bot quality");
  const [scenarios, setScenarios] = useState<BotTestScenario[]>([]);
  const [analytics, setAnalytics] = useState<BotAnalytics | null>(null);
  const [name, setName] = useState("Happy path");
  const [answersText, setAnswersText] = useState("{}");
  const [expectedText, setExpectedText] = useState('{\n  "status": "completed",\n  "variables": {}\n}');
  const [runs, setRuns] = useState<Record<string, ScenarioRun>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [bot, testItems, metrics] = await Promise.all([getBot(botId), listScenarios(botId), getBotAnalytics(botId)]);
      setBotName(bot.name);
      setScenarios(testItems);
      setAnalytics(metrics);
    } catch (caught) {
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login");
      else setError(caught instanceof Error ? caught.message : "Could not load quality workspace");
    }
  }, [botId, router]);

  useEffect(() => { void load(); }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const answers = JSON.parse(answersText) as Record<string, unknown>;
      const expected = JSON.parse(expectedText) as Record<string, unknown>;
      const scenario = await createScenario(botId, name, answers, expected);
      setScenarios((items) => [scenario, ...items]);
    } catch (caught) {
      setError(caught instanceof SyntaxError ? "Answers or expectations contain invalid JSON" : caught instanceof Error ? caught.message : "Could not create scenario");
    }
  };

  const execute = async (scenario: BotTestScenario) => {
    try {
      const result = await runScenario(botId, scenario.id);
      setRuns((current) => ({ ...current, [scenario.id]: result }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scenario failed to run");
    }
  };

  return (
    <main className="quality-page">
      <header className="quality-header">
        <div className="builder-brand"><Link className="icon-button" href={`/bots/${botId}/builder`} aria-label="Back to builder"><ChevronLeft size={19} /></Link><div><strong>{botName}</strong><span>Tests, debugger, and analytics</span></div></div>
      </header>
      {error ? <div className="form-error">{error}</div> : null}
      <section className="analytics-summary" aria-label="Conversation analytics">
        {[{ label: "Conversations", value: analytics?.conversations ?? 0 }, { label: "Completed", value: analytics?.completed ?? 0 }, { label: "Active / incomplete", value: analytics?.active ?? 0 }, { label: "Completion rate", value: `${Math.round((analytics?.completion_rate ?? 0) * 100)}%` }].map((item) => <article key={item.label}><BarChart3 size={18} /><span>{item.label}</span><strong>{item.value}</strong></article>)}
      </section>
      <div className="quality-grid">
        <form className="quality-card scenario-form" onSubmit={add}>
          <div><p className="eyebrow">Regression tests</p><h2>New scenario</h2></div>
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Answers by node ID<textarea spellCheck={false} value={answersText} onChange={(event) => setAnswersText(event.target.value)} /></label>
          <label>Expected outcome<textarea spellCheck={false} value={expectedText} onChange={(event) => setExpectedText(event.target.value)} /></label>
          <button className="primary-button" type="submit"><Plus size={15} /> Add scenario</button>
        </form>
        <section className="quality-card scenario-list">
          <div><p className="eyebrow">Automated runner</p><h2>Saved scenarios</h2></div>
          {scenarios.length === 0 ? <p className="contract-empty">No scenarios yet. Answers use graph node IDs as keys.</p> : scenarios.map((scenario) => {
            const run = runs[scenario.id];
            return (
              <article className="scenario-row" key={scenario.id}>
                <div><strong>{scenario.name}</strong><span>{run ? (run.passed ? "Passed" : `Failed: ${run.status}`) : "Not run"}</span></div>
                <button className="secondary-button" type="button" onClick={() => void execute(scenario)}><Play size={14} /> Run</button>
                <button className="mini-icon-button" type="button" aria-label={`Delete ${scenario.name}`} onClick={() => void deleteScenario(botId, scenario.id).then(() => setScenarios((items) => items.filter((item) => item.id !== scenario.id)))}><Trash2 size={14} /></button>
                {run ? <pre>{JSON.stringify(run, null, 2)}</pre> : null}
              </article>
            );
          })}
        </section>
      </div>
      <section className="quality-card analytics-detail">
        <div><p className="eyebrow">Flow analytics</p><h2>Node activity and drop-off</h2></div>
        <div className="analytics-json"><section><h3>Answers by node</h3><pre>{JSON.stringify(analytics?.answers_by_node ?? {}, null, 2)}</pre></section><section><h3>Incomplete at node</h3><pre>{JSON.stringify(analytics?.drop_off_by_node ?? {}, null, 2)}</pre></section></div>
        <div className="node-metric-table"><div className="node-metric-heading"><span>Node</span><span>Entered</span><span>Answered</span><span>Drop-off</span><span>Avg. dwell</span></div>{Object.entries(analytics?.node_metrics ?? {}).map(([nodeId, metric]) => <div key={nodeId}><strong>{nodeId}</strong><span>{metric.entered}</span><span>{metric.answered}</span><span>{metric.dropoffs}</span><span>{metric.average_dwell_seconds.toFixed(1)}s</span></div>)}</div>
      </section>
    </main>
  );
}
