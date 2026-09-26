"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, Clipboard, Code2, ExternalLink, Globe2, Pause, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { getBot } from "@/services/bots";
import { loadFlow } from "@/services/flows";
import {
  createDeployment,
  createSegment,
  deleteDeployment,
  deleteSegment,
  listDeployments,
  listSegments,
  refreshDeploymentVersion,
  updateDeployment,
  createDomain, deleteDomain, listDomains, verifyDomain,
} from "@/services/deployments";
import type { CustomDomain, DeploymentMode, DeploymentRecord, TargetSegment } from "@/types/api";


const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const siteBase = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function snippet(item: DeploymentRecord) {
  if (item.mode === "link") return `${siteBase}/chat/deployed?deployment=${item.deployment_key}`;
  const target = item.mode === "embed" ? ' data-target="#chatbot-container"' : "";
  return `<script async src="${apiBase}/public/sdk/v1.js" data-deployment="${item.deployment_key}"${target}></script>`;
}

export function DeploymentWorkspace({ botId }: { botId: string }) {
  const router = useRouter();
  const [botName, setBotName] = useState("Deployments");
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [segments, setSegments] = useState<TargetSegment[]>([]);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("Website widget");
  const [mode, setMode] = useState<DeploymentMode>("widget");
  const [environment, setEnvironment] = useState<DeploymentRecord["environment"]>("production");
  const [segmentId, setSegmentId] = useState("");
  const [configText, setConfigText] = useState('{\n  "primary_color": "#6d5dfc",\n  "launcher_label": "Chat with us"\n}');
  const [rulesText, setRulesText] = useState('{\n  "match": {\n    "combinator": "all",\n    "conditions": []\n  },\n  "frequency": { "once_per_session": false }\n}');
  const [segmentName, setSegmentName] = useState("Pricing visitors");
  const [segmentRules, setSegmentRules] = useState('{\n  "match": {\n    "combinator": "all",\n    "conditions": [{ "field": "url", "operator": "contains", "value": "/pricing" }]\n  }\n}');
  const [domainHost, setDomainHost] = useState("");
  const [message, setMessage] = useState("Loading deployment channels…");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [bot, flow, deploymentItems, segmentItems, domainItems] = await Promise.all([getBot(botId), loadFlow(botId), listDeployments(botId), listSegments(), listDomains(botId)]);
      setBotName(bot.name);
      setMode(flow.settings?.delivery_mode ?? "widget");
      setDeployments(deploymentItems);
      setSegments(segmentItems);
      setDomains(domainItems);
      setSelectedId((current) => current ?? deploymentItems[0]?.id ?? null);
      setMessage("Deployments loaded");
    } catch (caught) {
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login");
      else setError(caught instanceof Error ? caught.message : "Could not load deployments");
    }
  }, [botId, router]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => deployments.find((item) => item.id === selectedId) ?? null, [deployments, selectedId]);

  const addDeployment = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    try {
      const item = await createDeployment(botId, {
        name, mode, environment, target_segment_id: segmentId || null,
        config: JSON.parse(configText) as Record<string, unknown>,
        rules: JSON.parse(rulesText) as Record<string, unknown>,
      });
      setDeployments((items) => [item, ...items]); setSelectedId(item.id); setMessage("Deployment created with a pinned bot version");
    } catch (caught) { setError(caught instanceof SyntaxError ? "Config or targeting rules contain invalid JSON" : caught instanceof Error ? caught.message : "Could not create deployment"); }
  };

  const addSegment = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    try {
      const item = await createSegment(segmentName, JSON.parse(segmentRules) as Record<string, unknown>);
      setSegments((items) => [item, ...items]); setSegmentId(item.id); setMessage("Reusable audience segment created");
    } catch (caught) { setError(caught instanceof SyntaxError ? "Segment rules contain invalid JSON" : caught instanceof Error ? caught.message : "Could not create segment"); }
  };

  const replaceDeployment = (updated: DeploymentRecord) => setDeployments((items) => items.map((item) => item.id === updated.id ? updated : item));

  return (
    <main className="deployment-page">
      <header className="deployment-header">
        <div className="builder-brand"><Link className="icon-button" href={`/bots/${botId}/builder`} aria-label="Back to builder"><ChevronLeft size={19} /></Link><div><strong>{botName}</strong><span>Widget, link, embed, and audience targeting</span></div></div>
        <span className="save-status">{message}</span>
      </header>
      {error ? <div className="form-error">{error}</div> : null}
      <div className="deployment-layout">
        <section className="deployment-column">
          <form className="deployment-card" onSubmit={addDeployment}>
            <div><p className="eyebrow">New channel</p><h2>Create deployment</h2></div>
            <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <div className="deployment-fields"><label>Mode<select value={mode} onChange={(event) => setMode(event.target.value as DeploymentMode)}><option value="widget">Widget</option><option value="embed">Inline embed</option><option value="link">Share link</option></select></label><label>Environment<select value={environment} onChange={(event) => setEnvironment(event.target.value as DeploymentRecord["environment"])}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></select></label></div>
            <label>Audience segment<select value={segmentId} onChange={(event) => setSegmentId(event.target.value)}><option value="">No reusable segment</option>{segments.map((segment) => <option value={segment.id} key={segment.id}>{segment.name}</option>)}</select></label>
            <label>Appearance and behavior JSON<textarea spellCheck={false} value={configText} onChange={(event) => setConfigText(event.target.value)} /></label>
            <label>Page, device, schedule, and frequency rules<textarea spellCheck={false} value={rulesText} onChange={(event) => setRulesText(event.target.value)} /></label>
            <button className="primary-button" type="submit"><Plus size={15} /> Create deployment</button>
          </form>
          <form className="deployment-card" onSubmit={addSegment}>
            <div><p className="eyebrow">Reusable targeting</p><h2>Audience segment</h2></div>
            <label>Name<input value={segmentName} onChange={(event) => setSegmentName(event.target.value)} required /></label>
            <label>Targeting rules JSON<textarea spellCheck={false} value={segmentRules} onChange={(event) => setSegmentRules(event.target.value)} /></label>
            <button className="secondary-button" type="submit"><Users size={15} /> Save segment</button>
            <div className="segment-chips">{segments.map((segment) => <span key={segment.id}>{segment.name}<button type="button" aria-label={`Archive ${segment.name}`} onClick={() => void deleteSegment(segment.id).then(() => setSegments((items) => items.filter((item) => item.id !== segment.id)))}><Trash2 size={12} /></button></span>)}</div>
          </form>
        </section>
        <section className="deployment-card deployment-list-card">
          <div><p className="eyebrow">Installed channels</p><h2>Deployments</h2></div>
          {deployments.length === 0 ? <p className="contract-empty">Publish the bot, then create its first deployment.</p> : <div className="deployment-list">{deployments.map((item) => <button type="button" key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}><span><Globe2 size={15} /><strong>{item.name}</strong></span><small>{item.mode} · {item.environment} · {item.status}</small></button>)}</div>}
          {selected ? (
            <article className="deployment-detail">
              <div className="deployment-detail-heading"><div><h3>{selected.name}</h3><p>Pinned version ID: {selected.bot_version_id}</p></div><span className="status-pill">{selected.status}</span></div>
              <label>{selected.mode === "link" ? "Share URL" : "Installation snippet"}<textarea readOnly value={snippet(selected)} /></label>
              <div className="deployment-actions">
                <button className="secondary-button" type="button" onClick={() => void navigator.clipboard.writeText(snippet(selected)).then(() => setMessage("Installation code copied"))}><Clipboard size={14} /> Copy</button>
                {selected.mode === "link" ? <a className="secondary-button" href={snippet(selected)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a> : null}
                <button className="secondary-button" type="button" onClick={() => void refreshDeploymentVersion(selected.id).then((item) => { replaceDeployment(item); setMessage("Pinned to the newest published version"); })}><RefreshCw size={14} /> Latest version</button>
                <button className="secondary-button" type="button" onClick={() => void updateDeployment(selected.id, { status: selected.status === "paused" ? "active" : "paused" }).then(replaceDeployment)}><Pause size={14} /> {selected.status === "paused" ? "Activate" : "Pause"}</button>
                <button className="secondary-button" type="button" onClick={() => void deleteDeployment(selected.id).then(() => { setDeployments((items) => items.filter((item) => item.id !== selected.id)); setSelectedId(null); })}><Trash2 size={14} /> Archive</button>
              </div>
              <details><summary><Code2 size={14} /> Saved configuration</summary><pre>{JSON.stringify({ config: selected.config, rules: selected.rules }, null, 2)}</pre></details>
              <section className="domain-manager"><div><p className="eyebrow">Custom domain</p><h3>Verified hostname</h3></div><form onSubmit={(event) => { event.preventDefault(); if (!domainHost) return; void createDomain(selected.id, domainHost).then((item) => { setDomains((items) => [item, ...items]); setDomainHost(""); }); }}><input value={domainHost} onChange={(event) => setDomainHost(event.target.value)} placeholder="chat.example.com" /><button className="secondary-button" type="submit"><Plus size={13} /> Add</button></form>{domains.filter((item) => item.deployment_id === selected.id).map((item) => <article key={item.id}><div><strong>{item.hostname}</strong><small>{item.status === "verified" ? "Verified and ready for proxy routing" : <>Serve this token at <code>/.well-known/visual-chatbot-builder-verification</code>: <code>{item.verification_token}</code></>}</small></div><span className="status-pill">{item.status}</span>{item.status !== "verified" ? <button className="secondary-button" type="button" onClick={() => void verifyDomain(item.id).then((updated) => setDomains((items) => items.map((value) => value.id === updated.id ? updated : value)))}><CheckCircle2 size={13} /> Verify</button> : null}<button className="mini-icon-button" type="button" aria-label={`Delete ${item.hostname}`} onClick={() => void deleteDomain(item.id).then(() => setDomains((items) => items.filter((value) => value.id !== item.id)))}><Trash2 size={13} /></button></article>)}</section>
            </article>
          ) : null}
        </section>
      </div>
    </main>
  );
}
