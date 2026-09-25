"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, ChevronLeft, KeyRound, Link2, Plus, RefreshCw, Send, ShieldCheck, Trash2 } from "lucide-react";
import { getBot } from "@/services/bots";
import {
  createIntegration,
  deleteSubscription,
  disableIntegration,
  listDeliveries,
  listIntegrations,
  listSubscriptions,
  retryDelivery,
  subscribeIntegration,
} from "@/services/integrations";
import type { EventSubscription, IntegrationConnection, IntegrationDelivery } from "@/types/api";


const kinds: Array<{ value: IntegrationConnection["kind"]; label: string }> = [
  { value: "webhook", label: "Signed webhook" }, { value: "email", label: "SMTP email" },
  { value: "slack", label: "Slack webhook" }, { value: "sms", label: "SMS HTTP gateway" },
  { value: "storage", label: "Object storage" }, { value: "stripe", label: "Stripe" },
  { value: "paypal", label: "PayPal" }, { value: "google_calendar", label: "Google Calendar" },
  { value: "microsoft_calendar", label: "Microsoft Calendar" },
];

function starterConfig(kind: IntegrationConnection["kind"]) {
  if (kind === "email") return { host: "smtp.example.com", port: 587, from_email: "bot@example.com", to_email: "team@example.com", starttls: true };
  if (["webhook", "slack", "sms"].includes(kind)) return { url: "https://example.com/webhook", ...(kind === "sms" ? { message_template: "Your verification code is {code}", sender: "" } : {}) };
  if (kind === "storage") return { provider: "s3", bucket: "", region: "us-east-1", endpoint: "https://s3.us-east-1.amazonaws.com", path_style: true };
  if (kind === "stripe") return { success_url: "https://example.com/payment/success", cancel_url: "https://example.com/payment/cancel", product_name: "Chatbot payment" };
  if (kind === "paypal") return { environment: "sandbox", return_url: "https://example.com/payment/success", cancel_url: "https://example.com/payment/cancel" };
  if (["google_calendar", "microsoft_calendar"].includes(kind)) return { calendar_id: "primary", event_title: "Chatbot appointment" };
  return {};
}

function starterSecrets(kind: IntegrationConnection["kind"]) {
  if (kind === "stripe") return { secret_key: "" };
  if (kind === "paypal") return { client_id: "", client_secret: "" };
  if (kind === "storage") return { access_key_id: "", secret_access_key: "", session_token: "" };
  if (["google_calendar", "microsoft_calendar"].includes(kind)) return { access_token: "" };
  if (kind === "email") return { username: "", password: "" };
  if (kind === "sms") return { token: "" };
  return { signing_secret: "" };
}

export function IntegrationWorkspace({ botId }: { botId: string }) {
  const router = useRouter();
  const [botName, setBotName] = useState("Integrations");
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [subscriptions, setSubscriptions] = useState<EventSubscription[]>([]);
  const [deliveries, setDeliveries] = useState<IntegrationDelivery[]>([]);
  const [kind, setKind] = useState<IntegrationConnection["kind"]>("webhook");
  const [name, setName] = useState("Lead webhook");
  const [configText, setConfigText] = useState(JSON.stringify(starterConfig("webhook"), null, 2));
  const [secretsText, setSecretsText] = useState(JSON.stringify(starterSecrets("webhook"), null, 2));
  const [selectedConnection, setSelectedConnection] = useState("");
  const [eventName, setEventName] = useState<EventSubscription["event"]>("conversation.completed");
  const [message, setMessage] = useState("Loading secure connections…");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [bot, connectionItems, subscriptionItems, deliveryItems] = await Promise.all([getBot(botId), listIntegrations(), listSubscriptions(botId), listDeliveries()]);
      setBotName(bot.name); setConnections(connectionItems); setSubscriptions(subscriptionItems); setDeliveries(deliveryItems.filter((item) => item.bot_id === botId));
      setSelectedConnection((current) => current || connectionItems[0]?.id || ""); setMessage("Connections and delivery history loaded");
    } catch (caught) {
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login");
      else setError(caught instanceof Error ? caught.message : "Could not load integrations");
    }
  }, [botId, router]);
  useEffect(() => { void load(); }, [load]);

  const connectionById = useMemo(() => Object.fromEntries(connections.map((item) => [item.id, item])), [connections]);

  const addConnection = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    try {
      const item = await createIntegration({ kind, name, config: JSON.parse(configText), secrets: JSON.parse(secretsText) });
      setConnections((items) => [item, ...items]); setSelectedConnection(item.id); setMessage("Credentials encrypted and connection saved");
    } catch (caught) { setError(caught instanceof SyntaxError ? "Configuration or secrets contain invalid JSON" : caught instanceof Error ? caught.message : "Could not save connection"); }
  };

  const addSubscription = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedConnection) return;
    try { const item = await subscribeIntegration(botId, selectedConnection, eventName); setSubscriptions((items) => items.some((value) => value.id === item.id) ? items : [item, ...items]); setMessage("Event subscription is active"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not subscribe"); }
  };

  return (
    <main className="integration-page">
      <header className="integration-header"><div className="builder-brand"><Link className="icon-button" href={`/bots/${botId}/builder`}><ChevronLeft size={19} /></Link><div><strong>{botName}</strong><span>Credentials, notifications, webhooks, and providers</span></div></div><span className="save-status"><ShieldCheck size={14} /> {message}</span></header>
      {error ? <div className="form-error">{error}</div> : null}
      <div className="integration-grid">
        <form className="integration-card" onSubmit={addConnection}>
          <div><p className="eyebrow">Encrypted credential vault</p><h2>New connection</h2></div>
          <label>Provider<select value={kind} onChange={(event) => { const next = event.target.value as IntegrationConnection["kind"]; setKind(next); setConfigText(JSON.stringify(starterConfig(next), null, 2)); setSecretsText(JSON.stringify(starterSecrets(next), null, 2)); }}>{kinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Non-secret configuration<textarea spellCheck={false} value={configText} onChange={(event) => setConfigText(event.target.value)} /></label>
          <label><span><KeyRound size={13} /> Secret values</span><textarea spellCheck={false} value={secretsText} onChange={(event) => setSecretsText(event.target.value)} /></label>
          <button className="primary-button" type="submit"><Plus size={15} /> Save encrypted connection</button>
        </form>
        <section className="integration-card">
          <div><p className="eyebrow">Available providers</p><h2>Connections</h2></div>
          <div className="connection-list">{connections.length ? connections.map((item) => <article key={item.id}><div><Link2 size={15} /><span><strong>{item.name}</strong><small>{item.kind} · {item.has_secrets ? "credentials stored" : "no credentials"}</small></span></div><span className="status-pill">{item.status}</span><button type="button" aria-label={`Disable ${item.name}`} onClick={() => void disableIntegration(item.id).then(() => setConnections((items) => items.map((value) => value.id === item.id ? { ...value, status: "disabled" } : value)))}><Trash2 size={14} /></button></article>) : <p className="contract-empty">No provider connections yet.</p>}</div>
          <form className="subscription-form" onSubmit={addSubscription}><div><p className="eyebrow">Bot notifications</p><h3>Subscribe a channel</h3></div><select value={selectedConnection} onChange={(event) => setSelectedConnection(event.target.value)} required><option value="">Choose connection</option>{connections.filter((item) => item.status === "active" && ["webhook", "email", "slack", "sms"].includes(item.kind)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select value={eventName} onChange={(event) => setEventName(event.target.value as EventSubscription["event"])}><option value="conversation.started">Conversation started</option><option value="conversation.completed">Conversation completed</option><option value="response.qualified">Response qualified</option></select><button className="secondary-button" type="submit"><BellRing size={14} /> Subscribe</button></form>
          <div className="subscription-list">{subscriptions.map((item) => <span key={item.id}>{connectionById[item.connection_id]?.name ?? item.connection_id} · {item.event}<button type="button" onClick={() => void deleteSubscription(item.id).then(() => setSubscriptions((items) => items.filter((value) => value.id !== item.id)))}><Trash2 size={12} /></button></span>)}</div>
        </section>
        <section className="integration-card delivery-card">
          <div><p className="eyebrow">Durable outbox</p><h2>Delivery history</h2></div>
          {deliveries.length ? <div className="delivery-table">{deliveries.map((item) => <article key={item.id}><div><Send size={14} /><span><strong>{item.event}</strong><small>{connectionById[item.connection_id]?.name ?? item.connection_id}</small></span></div><span className={`status-pill status-${item.status}`}>{item.status}</span><small>{item.attempt_count} attempts{item.response_code ? ` · HTTP ${item.response_code}` : ""}</small><p>{item.last_error}</p>{item.status === "failed" ? <button className="secondary-button" type="button" onClick={() => void retryDelivery(item.id).then((updated) => setDeliveries((items) => items.map((value) => value.id === updated.id ? updated : value)))}><RefreshCw size={13} /> Retry</button> : null}</article>)}</div> : <p className="contract-empty">Delivery attempts appear after subscribed conversation events.</p>}
        </section>
      </div>
    </main>
  );
}
