"use client";

import { copyText } from "@/services/clipboard";
import { apiBaseUrl } from "@/services/api";
import { usePublicSiteUrl } from "@/hooks/usePublicSiteUrl";
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
  PencilLine,
  Rocket,
} from "lucide-react";
import { getBot } from "@/services/bots";
import { createDeployment, createDomain, deleteDomain, listDeployments, listDomains, verifyDomain } from "@/services/deployments";
import { useFlowStore } from "@/stores/flow-store";
import type { BotRecord, CustomDomain, DeploymentMode, DeploymentRecord } from "@/types/api";

type WidgetGuide = "website" | "wordpress" | "builders" | "email" | "assistant";
type EmbedGuide = "iframe" | "link";


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

type SocialId = "facebook" | "linkedin" | "x" | "whatsapp";

const socialTargets: Array<{ id: SocialId; label: string; href: (url: string, title: string) => string }> = [
  { id: "facebook", label: "Share on Facebook", href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { id: "linkedin", label: "Share on LinkedIn", href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  { id: "x", label: "Share on X", href: (url, title) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
  { id: "whatsapp", label: "Share on WhatsApp", href: (url, title) => `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`.trim())}` },
];

/** Small brand glyphs drawn inline so no icon package has to ship them. */
function SocialIcon({ id }: { id: SocialId }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;
  if (id === "facebook") return <svg {...common}><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z" /></svg>;
  if (id === "linkedin") return <svg {...common}><path d="M6.5 8.5H3.6V20h2.9zM5 3.5a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4zM20.4 13.7c0-3.3-1.8-4.9-4.1-4.9-1.9 0-2.7 1-3.2 1.8V8.5H10.2V20h2.9v-6.3c0-1.7.3-3.3 2.4-3.3 2 0 2 1.9 2 3.4V20h2.9z" /></svg>;
  if (id === "x") return <svg {...common}><path d="M17.5 3h3l-6.8 7.8L21.7 21h-6.3l-4.9-6.4L4.9 21h-3l7.3-8.3L1.5 3H8l4.4 5.9zm-1.1 16.2h1.7L7.7 4.7H5.9z" /></svg>;
  return <svg {...common}><path d="M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.5 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5zm0 17.1a7.7 7.7 0 0 1-3.9-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A7.7 7.7 0 1 1 12 19.6zm4.2-5.7c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z" /></svg>;
}

function deploymentForMode(deployments: DeploymentRecord[], mode: DeploymentMode) {
  return deployments.find((item) => item.mode === mode && item.status === "active")
    ?? deployments.find((item) => item.mode === mode)
    ?? null;
}

export function ShareWorkspace({ botId }: { botId: string }) {
  const appearance = useFlowStore((state) => state.appearance);
  // Opens on the channel used last time for this bot (per browser); the share link is the default.
  const modeKey = `spaghetti:share-mode:${botId}`;
  const [mode, setModeState] = useState<DeploymentMode>("link");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(modeKey);
      if (saved === "widget" || saved === "link" || saved === "embed") setModeState(saved);
    } catch {
      // Storage unavailable: keep the default.
    }
  }, [modeKey]);
  const setMode = (next: DeploymentMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(modeKey, next);
    } catch {
      // Ignore storage failures.
    }
  };
  const [widgetGuide, setWidgetGuide] = useState<WidgetGuide>("website");
  const [embedGuide, setEmbedGuide] = useState<EmbedGuide>("iframe");
  const [bot, setBot] = useState<BotRecord | null>(null);
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const siteBase = usePublicSiteUrl();
  const apiBase = apiBaseUrl();
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainError, setDomainError] = useState("");

  useEffect(() => {
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
  // The domain shown on the Share tab: a verified one first, otherwise the latest pending one.
  const shareDomain = verifiedDomain ?? domains[0] ?? null;

  /** Turn whatever was pasted (URL, host, trailing slash) into a bare hostname. */
  const normaliseHost = (value: string) => {
    const trimmed = value.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    return /^(?=.{4,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(trimmed) ? trimmed : null;
  };

  const ensureLinkDeployment = async () => {
    if (linkDeployment) return linkDeployment;
    const created = await createDeployment(botId, { name: "Share link", mode: "link", environment: "production", target_segment_id: null, config: {}, rules: {} });
    setDeployments((items) => [created, ...items]);
    return created;
  };

  const addDomain = async (event: React.FormEvent) => {
    event.preventDefault();
    const host = normaliseHost(domainInput);
    if (!host) {
      setDomainError("Enter a domain such as chat.example.com or https://chat.example.com.");
      return;
    }
    setDomainBusy(true);
    setDomainError("");
    try {
      const deployment = await ensureLinkDeployment();
      const created = await createDomain(deployment.id, host);
      setDomains((items) => [created, ...items]);
      setDomainInput("");
    } catch (caught) {
      setDomainError(caught instanceof Error ? caught.message : "Could not add the domain");
    } finally {
      setDomainBusy(false);
    }
  };

  const checkDomain = async (id: string) => {
    setDomainBusy(true);
    setDomainError("");
    try {
      const updated = await verifyDomain(id);
      setDomains((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      if (updated.status !== "verified") setDomainError("Not verified yet. Make sure the verification file is reachable, then check again.");
    } catch (caught) {
      setDomainError(caught instanceof Error ? caught.message : "Verification failed");
    } finally {
      setDomainBusy(false);
    }
  };

  const removeDomain = async (id: string) => {
    setDomainBusy(true);
    setDomainError("");
    try {
      await deleteDomain(id);
      setDomains((items) => items.filter((item) => item.id !== id));
    } catch (caught) {
      setDomainError(caught instanceof Error ? caught.message : "Could not remove the domain");
    } finally {
      setDomainBusy(false);
    }
  };
  // The short link opens /r/<code>, which resolves to the published bot (and its active Link deployment).
  const shortLink = bot?.share_code && siteBase ? `${verifiedDomain ? `https://${verifiedDomain.hostname}` : siteBase}/r/${bot.share_code}` : "";
  const linkPreviewAvatar = appearance.avatar_url ? <img src={appearance.avatar_url} alt="" /> : <MessageCircle size={14} />;

  const copyValue = async (value: string, key: string) => {
    await copyText(value);
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
          <div className="share-content-grid share-link-layout">
            <div className="share-panel-stack">
              <article className="share-panel">
                <div className="share-panel-heading">
                  <div><h2>Your page link</h2><p>Access your full-page chatbot with a short, shareable link.</p></div>
                  {linkDeployment?.status === "active" ? <span className="share-ready-pill"><Check size={13} /> Active</span> : null}
                </div>
                <div className="share-link-row">
                  <div className="share-readonly-field share-link-field">
                    <span className="share-link-text">{shortLink || "Loading share link…"}</span>
                    <span className="share-social">
                      {socialTargets.map((target) => (
                        <a key={target.id} className="share-social-button" href={shortLink ? target.href(shortLink, appearance.title || bot?.name || "") : "#"} target="_blank" rel="noreferrer" aria-label={target.label} title={target.label}>
                          <SocialIcon id={target.id} />
                        </a>
                      ))}
                      <a className="share-social-button" href={shortLink || "#"} target="_blank" rel="noreferrer" aria-label="Open link" title="Open link"><ExternalLink size={15} /></a>
                    </span>
                  </div>
                  <button className="primary-button" type="button" disabled={!shortLink} onClick={() => void copyValue(shortLink, "public-link")}>
                    {copied === "public-link" ? <Check size={15} /> : <Copy size={15} />}
                    {copied === "public-link" ? "Copied" : "Copy link"}
                  </button>
                </div>
                <p className="share-inline-note"><Info size={14} /> Always opens the latest published version. {linkDeployment ? <>Deployment link with targeting: <code>{publicLink}</code></> : <>Full address: <code>{publicLink}</code></>}</p>
              </article>

              <article className="share-panel">
                <div className="share-panel-heading">
                  <div><h2>Custom domain</h2><p>Access your full-page chatbot with your own address.</p></div>
                  {shareDomain ? <span className={`share-ready-pill${shareDomain.status === "verified" ? "" : " is-pending"}`}>{shareDomain.status === "verified" ? <><Check size={13} /> Verified</> : "Pending verification"}</span> : null}
                </div>
                {shareDomain ? (
                  <>
                    <div className="share-domain-row">
                      <div className="share-readonly-field">
                        <Globe2 size={16} />
                        <span>{`https://${shareDomain.hostname}`}</span>
                        <a className="share-social-button" href={`https://${shareDomain.hostname}`} target="_blank" rel="noreferrer" aria-label="Open custom domain"><ExternalLink size={15} /></a>
                      </div>
                      {shareDomain.status !== "verified" ? (
                        <button className="primary-button" type="button" disabled={domainBusy} onClick={() => void checkDomain(shareDomain.id)}>{domainBusy ? "Checking…" : "Verify"}</button>
                      ) : null}
                      <button className="secondary-button" type="button" disabled={domainBusy} onClick={() => void removeDomain(shareDomain.id)}>Remove</button>
                    </div>
                    {shareDomain.status !== "verified" ? (
                      <div className="share-domain-steps">
                        <p>To prove you own <strong>{shareDomain.hostname}</strong>, make this address return the token below, then press Verify:</p>
                        <code>https://{shareDomain.hostname}/.well-known/visual-chatbot-builder-verification</code>
                        <div className="share-domain-token"><code>{shareDomain.verification_token}</code><button type="button" className="share-social-button" aria-label="Copy verification token" onClick={() => void copyValue(shareDomain.verification_token, "domain-token")}>{copied === "domain-token" ? <Check size={15} /> : <Copy size={15} />}</button></div>
                        <p>Then point the domain at this server (a CNAME or A record) so visitors land on the chat page.</p>
                      </div>
                    ) : (
                      <p className="share-inline-note"><Info size={14} /> Your short link now uses this domain: <code>{shortLink}</code></p>
                    )}
                  </>
                ) : (
                  <form className="share-domain-row" onSubmit={(event) => void addDomain(event)}>
                    <div className="share-readonly-field share-domain-input">
                      <Globe2 size={16} />
                      <input
                        aria-label="Custom domain"
                        placeholder="https://your-domain.com"
                        value={domainInput}
                        spellCheck={false}
                        onChange={(event) => setDomainInput(event.target.value)}
                      />
                    </div>
                    <button className="primary-button" type="submit" disabled={domainBusy || !domainInput.trim()}>{domainBusy ? "Adding…" : "Add domain"}</button>
                  </form>
                )}
                {domainError ? <p className="share-inline-note share-inline-note-error"><Info size={14} /> {domainError}</p> : null}
              </article>
            </div>

            <article className="share-panel share-preview-panel">
              <div className="share-panel-heading">
                <div><h2>Link preview</h2><p>When you share the link on social media, this is how it looks.</p></div>
                <button className="secondary-button compact-action" type="button" onClick={() => window.dispatchEvent(new CustomEvent("spaghetti:open-tab", { detail: "design" }))}>
                  <PencilLine size={14} /> Customize
                </button>
              </div>
              <div className="share-social-card">
                <div className="share-social-meta">
                  <span className="share-social-site">{linkPreviewAvatar}<span>{appearance.title || bot?.name || "Spaghetti chatbot"}</span></span>
                  <strong>{shortLink ? shortLink.replace(/^https?:\/\//, "") : "…"}</strong>
                  <p>{appearance.description || "Start a conversation with us."}</p>
                </div>
                <div className="share-social-image" style={{ background: appearance.background_color }}>
                  {appearance.avatar_url ? <img src={appearance.avatar_url} alt="" /> : <span style={{ background: appearance.primary_color }}><MessageCircle size={24} /></span>}
                </div>
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
