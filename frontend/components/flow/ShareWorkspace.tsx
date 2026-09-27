"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  Globe2,
  Info,
  Link2,
  MessageCircle,
  Rocket,
} from "lucide-react";
import { getBot } from "@/services/bots";
import { listDeployments, listDomains } from "@/services/deployments";
import { useFlowStore } from "@/stores/flow-store";
import type { BotRecord, CustomDomain, DeploymentMode, DeploymentRecord } from "@/types/api";

type WidgetGuide = "website" | "wordpress" | "builders" | "email" | "assistant";
type EmbedGuide = "iframe" | "link";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

const shareModes: Array<{
  id: DeploymentMode;
  title: string;
  description: string;
  icon: typeof MessageCircle;
}> = [
  { id: "widget", title: "Widget", description: "Floating chat on your website", icon: MessageCircle },
  { id: "link", title: "Link", description: "A full-page shareable chatbot", icon: Link2 },
  { id: "embed", title: "Embed", description: "Place the chat inside a page", icon: Code2 },
];

const widgetGuides: Array<{ id: WidgetGuide; label: string }> = [
  { id: "website", label: "Website" },
  { id: "wordpress", label: "WordPress" },
  { id: "builders", label: "Website builders" },
  { id: "email", label: "Email" },
  { id: "assistant", label: "AI assistant" },
];

function deploymentForMode(deployments: DeploymentRecord[], mode: DeploymentMode) {
  return deployments.find((item) => item.mode === mode && item.status === "active")
    ?? deployments.find((item) => item.mode === mode)
    ?? null;
}

export function ShareWorkspace({ botId }: { botId: string }) {
  const preferredMode = useFlowStore((state) => state.settings.delivery_mode);
  const appearance = useFlowStore((state) => state.appearance);
  const [mode, setMode] = useState<DeploymentMode>(preferredMode);
  const [widgetGuide, setWidgetGuide] = useState<WidgetGuide>("website");
  const [embedGuide, setEmbedGuide] = useState<EmbedGuide>("iframe");
  const [bot, setBot] = useState<BotRecord | null>(null);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [siteBase, setSiteBase] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSiteBase(window.location.origin);
    let cancelled = false;
    Promise.all([getBot(botId), listDeployments(botId), listDomains(botId)])
      .then(([botRecord, deploymentRecords, domainRecords]) => {
        if (cancelled) return;
        setBot(botRecord);
        setDeployments(deploymentRecords);
        setDomains(domainRecords);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load sharing details");
      });
    return () => { cancelled = true; };
  }, [botId]);

  const selectedDeployment = useMemo(
    () => deploymentForMode(deployments, mode),
    [deployments, mode],
  );
  const linkDeployment = useMemo(
    () => deployments.find((item) => item.mode === "link" && item.status === "active") ?? null,
    [deployments],
  );
  const publicLink = bot && siteBase
    ? `${siteBase}/chat/${bot.slug}${linkDeployment ? `?deployment=${linkDeployment.deployment_key}` : ""}`
    : "Loading share link…";
  const widgetCode = selectedDeployment?.mode === "widget"
    ? `<script async src="${apiBase}/public/sdk/v1.js" data-deployment="${selectedDeployment.deployment_key}"></script>`
    : "Create an active Widget deployment to generate installation code.";
  const embedDeployment = deployments.find((item) => item.mode === "embed" && item.status === "active") ?? null;
  const embedLink = bot && siteBase
    ? `${siteBase}/chat/${bot.slug}${embedDeployment ? `?deployment=${embedDeployment.deployment_key}` : ""}`
    : "Loading embed link…";
  const iframeCode = `<iframe src="${embedLink}" width="100%" height="600" frameborder="0" title="${bot?.name ?? "Spaghetti"} chatbot"></iframe>`;
  const verifiedDomain = domains.find((item) => item.status === "verified");

  const copyValue = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => current === key ? "" : current), 1600);
  };

  const hasModeDeployment = selectedDeployment?.status === "active";

  return (
    <section className="share-workspace" aria-label="Share chatbot">
      <div className="share-container">
        <header className="share-heading">
          <div>
            <span className="share-eyebrow"><Globe2 size={14} /> Share & install</span>
            <h1>Put your chatbot where people can reach it</h1>
            <p>Choose a channel, then copy the ready-to-use link or installation code.</p>
          </div>
          <Link className="secondary-button" href={`/bots/${botId}/deployments`}>
            <Rocket size={15} /> Manage deployments
          </Link>
        </header>

        {error ? <div className="share-notice share-notice-error">{error}</div> : null}

        <div className="share-mode-picker" role="tablist" aria-label="Share method">
          {shareModes.map((item) => {
            const Icon = item.icon;
            const deployment = deploymentForMode(deployments, item.id);
            return (
              <button
                className={`share-mode-card${mode === item.id ? " is-active" : ""}`}
                key={item.id}
                type="button"
                role="tab"
                aria-selected={mode === item.id}
                onClick={() => setMode(item.id)}
              >
                <span className="share-mode-icon"><Icon size={20} /></span>
                <span><strong>{item.title}</strong><small>{item.description}</small></span>
                <span className={`share-channel-dot${deployment?.status === "active" ? " is-ready" : ""}`} aria-label={deployment?.status === "active" ? "Active" : "Not configured"} />
              </button>
            );
          })}
        </div>

        {mode === "link" ? (
          <div className="share-content-grid">
            <div className="share-panel-stack">
              <article className="share-panel">
                <div className="share-panel-heading">
                  <div><h2>Your share link</h2><p>Open your chatbot as a clean, full-page experience.</p></div>
                  {linkDeployment?.status === "active" ? <span className="share-ready-pill"><Check size={13} /> Active</span> : null}
                </div>
                <div className="share-link-row">
                  <div className="share-readonly-field"><Link2 size={16} /><span>{publicLink}</span></div>
                  <button className="primary-button" type="button" disabled={!bot || !siteBase} onClick={() => void copyValue(publicLink, "public-link")}>
                    {copied === "public-link" ? <Check size={15} /> : <Copy size={15} />}
                    {copied === "public-link" ? "Copied" : "Copy link"}
                  </button>
                  <a className="secondary-button share-open-button" href={publicLink} target="_blank" rel="noreferrer" aria-label="Open share link">
                    <ExternalLink size={15} />
                  </a>
                </div>
                {!linkDeployment ? (
                  <p className="share-inline-note"><Info size={14} /> This direct link uses the latest published version. Create a Link deployment for targeting and a pinned version.</p>
                ) : null}
              </article>

              <article className="share-panel">
                <div className="share-panel-heading">
                  <div><h2>Custom domain</h2><p>Use your own address for a branded sharing experience.</p></div>
                </div>
                <div className="share-domain-row">
                  <div className="share-readonly-field"><Globe2 size={16} /><span>{verifiedDomain ? `https://${verifiedDomain.hostname}` : "No verified domain yet"}</span></div>
                  <Link className="secondary-button" href={`/bots/${botId}/deployments`}>{verifiedDomain ? "Manage" : "Set up"}</Link>
                </div>
              </article>
            </div>

            <article className="share-panel share-preview-panel">
              <div className="share-panel-heading"><div><h2>Link preview</h2><p>A simple preview of how the shared page appears.</p></div></div>
              <div className="share-social-preview">
                <div className="share-social-image" style={{ background: appearance.background_color }}>
                  <span style={{ background: appearance.primary_color }}><MessageCircle size={24} /></span>
                </div>
                <div><span className="share-preview-domain">{verifiedDomain?.hostname ?? (siteBase ? new URL(siteBase).host : "spaghetti.chat")}</span><strong>{appearance.title || bot?.name || "Spaghetti chatbot"}</strong><p>{appearance.description || "Start a conversation with us."}</p></div>
              </div>
            </article>
          </div>
        ) : null}

        {mode === "widget" ? (
          <article className="share-panel share-install-panel">
            <div className="share-guide-tabs" role="tablist" aria-label="Widget instructions">
              {widgetGuides.map((guide) => (
                <button className={widgetGuide === guide.id ? "is-active" : ""} type="button" role="tab" aria-selected={widgetGuide === guide.id} key={guide.id} onClick={() => setWidgetGuide(guide.id)}>{guide.label}</button>
              ))}
            </div>
            <div className="share-install-content">
              <div className="share-panel-heading">
                <div>
                  <h2>{widgetGuide === "email" ? "Share in an email" : widgetGuide === "assistant" ? "Give the chatbot to an AI assistant" : `Add the widget to ${widgetGuide === "website" ? "your website" : widgetGuide === "wordpress" ? "WordPress" : "a website builder"}`}</h2>
                  <p>{widgetGuide === "email" || widgetGuide === "assistant" ? "Copy the public link below and place it in your message or workflow." : "Paste this snippet before the closing </body> tag. The launcher will appear automatically."}</p>
                </div>
                {hasModeDeployment ? <span className="share-ready-pill"><Check size={13} /> Ready</span> : null}
              </div>
              {widgetGuide === "email" || widgetGuide === "assistant" ? (
                <div className="share-link-row">
                  <div className="share-readonly-field"><Link2 size={16} /><span>{publicLink}</span></div>
                  <button className="primary-button" type="button" onClick={() => void copyValue(publicLink, "guide-link")}>{copied === "guide-link" ? <Check size={15} /> : <Copy size={15} />}{copied === "guide-link" ? "Copied" : "Copy link"}</button>
                </div>
              ) : (
                <div className="share-code-block">
                  <code>{widgetCode}</code>
                  <button type="button" disabled={!hasModeDeployment} onClick={() => void copyValue(widgetCode, "widget-code")} aria-label="Copy widget code">{copied === "widget-code" ? <Check size={16} /> : <Copy size={16} />}</button>
                </div>
              )}
              {!hasModeDeployment && widgetGuide !== "email" && widgetGuide !== "assistant" ? (
                <div className="share-notice"><Info size={15} /><span>Publish the bot and create an active Widget deployment to unlock this installation code.</span><Link href={`/bots/${botId}/deployments`}>Create deployment</Link></div>
              ) : null}
            </div>
          </article>
        ) : null}

        {mode === "embed" ? (
          <article className="share-panel share-install-panel">
            <div className="share-guide-tabs share-guide-tabs-two" role="tablist" aria-label="Embed instructions">
              <button className={embedGuide === "iframe" ? "is-active" : ""} type="button" role="tab" aria-selected={embedGuide === "iframe"} onClick={() => setEmbedGuide("iframe")}>Iframe</button>
              <button className={embedGuide === "link" ? "is-active" : ""} type="button" role="tab" aria-selected={embedGuide === "link"} onClick={() => setEmbedGuide("link")}>Direct link</button>
            </div>
            <div className="share-install-content">
              <div className="share-panel-heading">
                <div><h2>{embedGuide === "iframe" ? "Embed with an iframe" : "Embed link"}</h2><p>{embedGuide === "iframe" ? "Paste this HTML where the chatbot should appear inside your page." : "Use this URL in any tool that accepts an embedded web page."}</p></div>
                {embedDeployment?.status === "active" ? <span className="share-ready-pill"><Check size={13} /> Ready</span> : null}
              </div>
              {embedGuide === "iframe" ? (
                <div className="share-code-block">
                  <code>{iframeCode}</code>
                  <button type="button" onClick={() => void copyValue(iframeCode, "iframe-code")} aria-label="Copy iframe code">{copied === "iframe-code" ? <Check size={16} /> : <Copy size={16} />}</button>
                </div>
              ) : (
                <div className="share-link-row">
                  <div className="share-readonly-field"><Link2 size={16} /><span>{embedLink}</span></div>
                  <button className="primary-button" type="button" onClick={() => void copyValue(embedLink, "embed-link")}>{copied === "embed-link" ? <Check size={15} /> : <Copy size={15} />}{copied === "embed-link" ? "Copied" : "Copy link"}</button>
                </div>
              )}
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
