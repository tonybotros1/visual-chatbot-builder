"use client";

import { useEffect, useState } from "react";
import { Check, Eye, Globe2, Lock, PencilLine } from "lucide-react";
import { getAccessSettings, getSiteSettings, updateAccessSettings, updateSiteSettings, type BotSharing } from "@/services/platform";

const CHOICES: { value: BotSharing; label: string; help: string; icon: typeof Lock }[] = [
  { value: "private", label: "Private", help: "Each account sees only its own bots and the bots it was invited to on a Team page.", icon: Lock },
  { value: "view", label: "Everyone can view", help: "Every account sees every bot and can open, preview and test it, but only owners, invited editors and admins can change it.", icon: Eye },
  { value: "edit", label: "Everyone can edit", help: "Every account sees every bot and can edit and publish it. Renaming, archiving, moving between workspaces and team management stay with the owner and platform admins.", icon: PencilLine },
];

export function AccessSection() {
  const [saved, setSaved] = useState<BotSharing>("private");
  const [choice, setChoice] = useState<BotSharing>("private");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlMessage, setUrlMessage] = useState("");
  const [urlError, setUrlError] = useState("");

  useEffect(() => {
    getSiteSettings()
      .then((settings) => {
        setSavedUrl(settings.public_url);
        setPublicUrl(settings.public_url);
      })
      .catch(() => undefined);
  }, []);

  const saveUrl = async () => {
    setSavingUrl(true);
    setUrlError("");
    setUrlMessage("");
    try {
      const settings = await updateSiteSettings({ public_url: publicUrl });
      setSavedUrl(settings.public_url);
      setPublicUrl(settings.public_url);
      setUrlMessage(settings.public_url ? `Share links now use ${settings.public_url}.` : "Share links follow the address each person opened the app with.");
    } catch (caught) {
      setUrlError(caught instanceof Error ? caught.message : "Could not save the address");
    } finally {
      setSavingUrl(false);
    }
  };

  useEffect(() => {
    getAccessSettings()
      .then((settings) => {
        setSaved(settings.bot_sharing);
        setChoice(settings.bot_sharing);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load access settings"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const settings = await updateAccessSettings({ bot_sharing: choice });
      setSaved(settings.bot_sharing);
      setChoice(settings.bot_sharing);
      setMessage("Saved. Everyone sees the new rule the next time their dashboard loads.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save access settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section>
      <header className="section-header">
        <div>
          <p className="eyebrow">Platform settings</p>
          <h1>Who can see the bots</h1>
        </div>
      </header>
      <p className="muted">Platform admins always see and manage every bot. This rule decides what ordinary builder accounts see.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-notice" role="status">{message}</p> : null}

      <div className="card access-card">
        <div className="access-choices" role="radiogroup" aria-label="Bot sharing">
          {CHOICES.map(({ value, label, help, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={choice === value}
              className={`access-choice${choice === value ? " is-active" : ""}`}
              onClick={() => setChoice(value)}
            >
              <span className="access-choice-icon"><Icon size={18} /></span>
              <span className="access-choice-copy">
                <strong>{label}</strong>
                <small>{help}</small>
              </span>
              {choice === value ? <Check size={16} className="access-choice-check" /> : null}
            </button>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="primary-button" disabled={choice === saved || saving} onClick={() => void save()}>
            <Check size={15} /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="card access-card site-card">
        <div className="site-card-head">
          <span className="access-choice-icon"><Globe2 size={18} /></span>
          <div>
            <h2>Public address for share links</h2>
            <p className="muted">The address put into share links, QR codes and embed snippets. Use the one other people can reach, for example <code>http://192.168.40.86:3000</code>. Leave it empty to use whatever address each person opened the app with.</p>
          </div>
        </div>
        {urlError ? <p className="form-error" role="alert">{urlError}</p> : null}
        {urlMessage ? <p className="form-notice" role="status">{urlMessage}</p> : null}
        <div className="site-url-row">
          <input
            aria-label="Public address"
            placeholder="http://192.168.40.86:3000"
            value={publicUrl}
            spellCheck={false}
            onChange={(event) => setPublicUrl(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void saveUrl(); }}
          />
          <button type="button" className="primary-button" disabled={publicUrl.trim().replace(/\/$/, "") === savedUrl || savingUrl} onClick={() => void saveUrl()}>
            <Check size={15} /> {savingUrl ? "Saving…" : "Save address"}
          </button>
        </div>
      </div>
    </section>
  );
}
