"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getBot, updateBot } from "@/services/bots";
import {
  BellRing,
  Check,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  Globe2,
  Languages,
  Link2,
  Mail,
  MessageCircleMore,
  MonitorUp,
  PanelTopOpen,
  Plus,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useFlowStore } from "@/stores/flow-store";
import type { FlowSettings } from "@/types/flow";

type SettingsSection = "general" | "notifications" | "translations" | "data";

const delayPresets = [0, 0.5, 1, 2];
const timezones = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Beirut",
  "Africa/Cairo",
  "Europe/London",
  "America/New_York",
  "UTC",
];

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings2 }> = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "translations", label: "Translations", icon: Languages },
  { id: "data", label: "Data collection", icon: Database },
];

const deliveryModes: Array<{
  id: FlowSettings["delivery_mode"];
  label: string;
  description: string;
  icon: typeof MessageCircleMore;
}> = [
  { id: "widget", label: "Widget", description: "Floating website chat", icon: MessageCircleMore },
  { id: "link", label: "Share link", description: "Standalone chat page", icon: Link2 },
  { id: "embed", label: "Embed", description: "Inline on your page", icon: PanelTopOpen },
];

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`settings-toggle${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span />
    </button>
  );
}

export function SettingsWorkspace({ botId }: { botId: string }) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState("");
  const [savedSlug, setSavedSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [recipientDraft, setRecipientDraft] = useState("");
  const [showNotificationFilters, setShowNotificationFilters] = useState(false);
  const appearance = useFlowStore((state) => state.appearance);
  const nodes = useFlowStore((state) => state.nodes);
  const settings = useFlowStore((state) => state.settings);
  const updateAppearance = useFlowStore((state) => state.updateAppearance);
  const updateSettings = useFlowStore((state) => state.updateSettings);

  const notificationVariables = useMemo(
    () => Array.from(new Set(nodes.map((node) => node.data.variable?.trim()).filter((value): value is string => Boolean(value)))),
    [nodes],
  );
  const emailVariables = useMemo(
    () => Array.from(new Set(nodes.filter((node) => node.type === "emailInput").map((node) => node.data.variable?.trim()).filter((value): value is string => Boolean(value)))),
    [nodes],
  );

  const setDelay = (value: number) => {
    const normalized = Math.min(10, Math.max(0, Number.isFinite(value) ? value : 0));
    updateSettings({ response_delay_seconds: normalized });
  };

  useEffect(() => {
    getBot(botId)
      .then((bot) => {
        setSlug(bot.slug);
        setSavedSlug(bot.slug);
      })
      .catch(() => undefined);
  }, [botId]);

  const saveSlug = async () => {
    const next = slug.trim().toLowerCase();
    if (!next || next === savedSlug) {
      setSlug(savedSlug);
      setSlugError("");
      return;
    }
    try {
      const bot = await updateBot(botId, { slug: next });
      setSlug(bot.slug);
      setSavedSlug(bot.slug);
      setSlugError("");
    } catch (caught) {
      setSlugError(caught instanceof Error ? caught.message : "Could not update the link");
    }
  };

  const copyBotId = async () => {
    await navigator.clipboard.writeText(botId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const addRecipient = () => {
    const email = recipientDraft.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || settings.notification_to_emails.includes(email)) return;
    updateSettings({ notification_to_emails: [...settings.notification_to_emails, email] });
    setRecipientDraft("");
  };

  const updateNotificationFilter = (
    index: number,
    updates: Partial<FlowSettings["notification_filters"][number]>,
  ) => {
    updateSettings({
      notification_filters: settings.notification_filters.map((filter, filterIndex) => (
        filterIndex === index ? { ...filter, ...updates } : filter
      )),
    });
  };

  return (
    <section className="settings-workspace">
      <aside className="settings-navigation" aria-label="Settings sections">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button
              className={activeSection === section.id ? "is-active" : ""}
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              <Icon size={16} /> {section.label}
            </button>
          );
        })}
      </aside>

      <div className="settings-content">
        {activeSection === "general" ? (
          <>
            <header className="settings-heading">
              <div className="settings-heading-icon"><Settings2 size={20} /></div>
              <div>
                <h1>General</h1>
                <p>Set the chatbot availability, behavior, and default delivery experience.</p>
              </div>
            </header>

            <div className="settings-section-stack">
              <article className="settings-card settings-toggle-card">
                <div className="settings-card-copy">
                  <label>Enable chatbot</label>
                  <p>Temporarily stop published visitors from starting new conversations.</p>
                </div>
                <Toggle checked={settings.enabled} label="Enable chatbot" onChange={(enabled) => updateSettings({ enabled })} />
              </article>

              <article className="settings-card settings-toggle-card">
                <div className="settings-card-copy">
                  <label>Progress bar</label>
                  <p>Show visitors how far they have moved through the conversation.</p>
                </div>
                <Toggle checked={settings.show_progress_bar} label="Show progress bar" onChange={(show_progress_bar) => updateSettings({ show_progress_bar })} />
              </article>

              <article className="settings-card">
                <div className="settings-card-copy">
                  <label htmlFor="response-delay">Response delay</label>
                  <p>Wait before showing each chatbot message. Use 0 for an instant response.</p>
                </div>
                <div className="settings-delay-control">
                  <div className="settings-number-field">
                    <input id="response-delay" type="number" min="0" max="10" step="0.5" value={settings.response_delay_seconds} onChange={(event) => setDelay(event.target.valueAsNumber)} />
                    <span>seconds</span>
                  </div>
                  <div className="settings-presets" aria-label="Response delay presets">
                    {delayPresets.map((preset) => (
                      <button className={settings.response_delay_seconds === preset ? "is-active" : ""} key={preset} type="button" onClick={() => setDelay(preset)}>
                        {preset === 0 ? "Instant" : `${preset}s`}
                      </button>
                    ))}
                  </div>
                </div>
              </article>

              <fieldset className="settings-fieldset">
                <legend>Default delivery type</legend>
                <p>Used as the starting choice when you create a new deployment.</p>
                <div className="settings-delivery-grid">
                  {deliveryModes.map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button className={settings.delivery_mode === mode.id ? "is-active" : ""} key={mode.id} type="button" onClick={() => updateSettings({ delivery_mode: mode.id })}>
                        <span><Icon size={19} /></span>
                        <strong>{mode.label}</strong>
                        <small>{mode.description}</small>
                        {settings.delivery_mode === mode.id ? <Check className="settings-choice-check" size={14} /> : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="settings-form-card">
                <label>
                  Chatbot title
                  <input value={appearance.title} onChange={(event) => updateAppearance({ title: event.target.value })} placeholder="Spaghetti chatbot" />
                  <small>Shown at the top of the chat window.</small>
                </label>
                <label>
                  Public link
                  <span className="settings-slug-field">
                    <span>/chat/</span>
                    <input
                      value={slug}
                      spellCheck={false}
                      onChange={(event) => setSlug(event.target.value)}
                      onBlur={() => void saveSlug()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </span>
                  <small>{slugError ? <span className="design-field-error">{slugError}</span> : "Letters, numbers and dashes. Changing it breaks links you have already shared."}</small>
                </label>
                <label>
                  Time zone
                  <select value={settings.timezone} onChange={(event) => updateSettings({ timezone: event.target.value })}>
                    {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                  </select>
                  <small>Used for appointment and schedule display.</small>
                </label>
                <label>
                  Chatbot ID
                  <span className="settings-copy-field">
                    <input readOnly value={botId} />
                    <button aria-label="Copy chatbot ID" type="button" onClick={() => void copyBotId()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
                  </span>
                </label>
              </div>
            </div>
          </>
        ) : null}

        {activeSection === "notifications" ? (
          <>
            <header className="settings-heading">
              <div className="settings-heading-icon"><BellRing size={20} /></div>
              <div><h1>Notifications</h1><p>Choose when and where response notifications are delivered.</p></div>
            </header>

            <div className="notification-settings">
              <article className="notification-setting-row">
                <div><strong>Email notifications</strong><p>Send notifications through the active SMTP email connection.</p></div>
                <Toggle checked={settings.email_notifications_enabled} label="Email notifications" onChange={(email_notifications_enabled) => updateSettings({ email_notifications_enabled })} />
              </article>

              <article className="notification-setting-row">
                <div><strong>Send incomplete responses</strong><p>Also notify when a visitor starts but has not completed the conversation.</p></div>
                <Toggle checked={settings.send_incomplete_notifications} label="Send incomplete responses" onChange={(send_incomplete_notifications) => updateSettings({ send_incomplete_notifications })} />
              </article>

              <article className="notification-form-row">
                <label htmlFor="notification-from-email"><strong>From email</strong><span>Leave blank to use the sender configured in Integrations.</span></label>
                <input id="notification-from-email" type="email" placeholder="notifications@example.com" value={settings.notification_from_email} onChange={(event) => updateSettings({ notification_from_email: event.target.value })} />
              </article>

              <article className="notification-form-row notification-recipient-row">
                <label htmlFor="notification-recipient"><strong>To email</strong><span>Add one or more notification recipients.</span></label>
                <div className="notification-recipient-control">
                  <div className="notification-recipient-entry">
                    <input
                      id="notification-recipient"
                      type="email"
                      placeholder="team@example.com"
                      value={recipientDraft}
                      onChange={(event) => setRecipientDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addRecipient();
                        }
                      }}
                    />
                    <button className="secondary-button" type="button" onClick={addRecipient}><Plus size={14} /> Add email</button>
                  </div>
                  {settings.notification_to_emails.length ? (
                    <div className="notification-recipient-list">
                      {settings.notification_to_emails.map((email) => (
                        <span key={email}>{email}<button type="button" aria-label={`Remove ${email}`} onClick={() => updateSettings({ notification_to_emails: settings.notification_to_emails.filter((item) => item !== email) })}>×</button></span>
                      ))}
                    </div>
                  ) : <small>The recipient configured in Integrations will be used.</small>}
                </div>
              </article>

              <article className="notification-form-row notification-filter-row">
                <div><strong>To filters</strong><p>Only send a notification when captured answers match your rules.</p></div>
                <button className="secondary-button" type="button" onClick={() => setShowNotificationFilters((visible) => !visible)}><SlidersHorizontal size={14} /> Configure filters{settings.notification_filters.length ? ` (${settings.notification_filters.length})` : ""}</button>
              </article>

              {showNotificationFilters ? (
                <div className="notification-filter-panel">
                  <div className="notification-filter-heading"><div><strong>Answer filters</strong><p>All configured rules must match.</p></div><button type="button" onClick={() => updateSettings({ notification_filters: [...settings.notification_filters, { variable: notificationVariables[0] ?? "", operator: "equals", value: "" }] })}><Plus size={14} /> Add filter</button></div>
                  {settings.notification_filters.length ? settings.notification_filters.map((filter, index) => (
                    <div className="notification-filter-item" key={`${index}-${filter.variable}`}>
                      <select aria-label={`Filter ${index + 1} field`} value={filter.variable} onChange={(event) => updateNotificationFilter(index, { variable: event.target.value })}>
                        <option value="">Select answer</option>
                        {notificationVariables.map((variable) => <option key={variable} value={variable}>{variable}</option>)}
                      </select>
                      <select aria-label={`Filter ${index + 1} operator`} value={filter.operator} onChange={(event) => updateNotificationFilter(index, { operator: event.target.value as FlowSettings["notification_filters"][number]["operator"] })}>
                        <option value="equals">Equals</option>
                        <option value="not_equals">Does not equal</option>
                        <option value="contains">Contains</option>
                      </select>
                      <input aria-label={`Filter ${index + 1} value`} placeholder="Value" value={filter.value} onChange={(event) => updateNotificationFilter(index, { value: event.target.value })} />
                      <button aria-label={`Delete filter ${index + 1}`} type="button" onClick={() => updateSettings({ notification_filters: settings.notification_filters.filter((_, filterIndex) => filterIndex !== index) })}><Trash2 size={15} /></button>
                    </div>
                  )) : <p className="notification-filter-empty">No filters. Every eligible response will trigger a notification.</p>}
                </div>
              ) : null}

              <article className="notification-form-row notification-subject-row">
                <label htmlFor="notification-subject"><strong>Subject</strong><span>Customize the email subject and optional context.</span></label>
                <div>
                  <input id="notification-subject" value={settings.notification_subject} onChange={(event) => updateSettings({ notification_subject: event.target.value })} />
                  <span className="notification-subject-plus">+</span>
                  <select aria-label="Append to notification subject" value={settings.notification_subject_append} onChange={(event) => updateSettings({ notification_subject_append: event.target.value as FlowSettings["notification_subject_append"] })}>
                    <option value="none">Nothing</option>
                    <option value="chatbot_title">Chatbot title</option>
                    <option value="status">Response status</option>
                    <option value="session_id">Session ID</option>
                  </select>
                </div>
              </article>

              <article className="notification-form-row">
                <label htmlFor="notification-reply-to"><strong>Reply to</strong><span>Reply directly to the email answer captured from the visitor.</span></label>
                <select id="notification-reply-to" value={settings.notification_reply_to_variable} onChange={(event) => updateSettings({ notification_reply_to_variable: event.target.value })}>
                  <option value="">No reply-to address</option>
                  {emailVariables.map((variable) => <option key={variable} value={variable}>{variable}</option>)}
                </select>
              </article>
            </div>

            <article className="settings-feature-card notification-channel-card">
              <div className="settings-feature-visual"><Mail size={24} /></div>
              <div><h2>Delivery connection</h2><p>SMTP credentials and other channels remain securely managed in Integrations.</p></div>
              <Link className="secondary-button" href={`/bots/${botId}/integrations`}>Manage connection <ExternalLink size={14} /></Link>
            </article>
            <p className="settings-note"><Clock3 size={15} /> Changes are stored when you select Save draft.</p>
          </>
        ) : null}

        {activeSection === "translations" ? (
          <>
            <header className="settings-heading">
              <div className="settings-heading-icon"><Languages size={20} /></div>
              <div><h1>Translations</h1><p>Manage localized chatbot content and text direction.</p></div>
            </header>
            <article className="settings-feature-card">
              <div className="settings-feature-visual"><Globe2 size={26} /></div>
              <div>
                <h2>Languages and RTL support</h2>
                <p>Add languages, choose the default locale, translate individual node content, and support left-to-right or right-to-left conversations.</p>
              </div>
              <Link className="secondary-button" href={`/bots/${botId}/localization`}>Manage languages <ExternalLink size={14} /></Link>
            </article>
          </>
        ) : null}

        {activeSection === "data" ? (
          <>
            <header className="settings-heading">
              <div className="settings-heading-icon"><Database size={20} /></div>
              <div><h1>Data collection</h1><p>Control visitor context and review the response data stored by this chatbot.</p></div>
            </header>
            <div className="settings-section-stack">
              <article className="settings-card settings-toggle-card">
                <div className="settings-card-copy">
                  <label>Capture visitor context</label>
                  <p>Store eligible page URL, referrer, language, and deployment context with new published conversations.</p>
                </div>
                <Toggle checked={settings.collect_visitor_context} label="Capture visitor context" onChange={(collect_visitor_context) => updateSettings({ collect_visitor_context })} />
              </article>
              <article className="settings-feature-card settings-data-card">
                <div className="settings-feature-visual"><MonitorUp size={26} /></div>
                <div>
                  <h2>Response data</h2>
                  <p>Review captured answers, export CSV, JSON, or XLSX files, tag conversations, and purge stored responses from the response workspace.</p>
                </div>
                <Link className="secondary-button" href={`/bots/${botId}/responses`}>Open responses <ExternalLink size={14} /></Link>
              </article>
            </div>
          </>
        ) : null}

        {activeSection === "general" ? (
          <p className="settings-note"><Clock3 size={15} /> Changes are stored when you select Save draft.</p>
        ) : null}
      </div>
    </section>
  );
}
