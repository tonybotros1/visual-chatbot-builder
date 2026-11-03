"use client";

import { useEffect, useState } from "react";
import { Check, Palette, RotateCcw } from "lucide-react";
import { applyBranding, defaultBranding, rememberBranding } from "@/components/brand/BrandingProvider";
import { getBranding, updateBranding } from "@/services/branding";
import type { BrandingRecord } from "@/types/api";

const HEX = /^#[0-9a-fA-F]{6}$/;

type ColorKey = keyof BrandingRecord;

const fields: { key: ColorKey; label: string; help: string }[] = [
  { key: "primary_color", label: "Main colour", help: "Buttons, links, focus rings, hover states and active items across the whole app." },
  { key: "secondary_color", label: "Second colour", help: "Accent for logic and component nodes and decorative highlights that should stand apart from the main colour." },
];

export function BrandingSection() {
  const [saved, setSaved] = useState<BrandingRecord>(defaultBranding);
  const [draft, setDraft] = useState<BrandingRecord>(defaultBranding);
  const [text, setText] = useState<BrandingRecord>(defaultBranding);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getBranding()
      .then((branding) => {
        setSaved(branding);
        setDraft(branding);
        setText(branding);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load branding"))
      .finally(() => setLoading(false));
  }, []);

  // Changes preview live; leaving the section without saving restores the saved colours.
  useEffect(() => {
    applyBranding(draft);
  }, [draft]);
  useEffect(() => () => applyBranding(saved), [saved]);

  const change = (key: ColorKey, raw: string) => {
    const value = raw.startsWith("#") ? raw : `#${raw}`;
    setText((current) => ({ ...current, [key]: value }));
    if (HEX.test(value)) setDraft((current) => ({ ...current, [key]: value.toUpperCase() }));
  };

  const dirty = draft.primary_color !== saved.primary_color || draft.secondary_color !== saved.secondary_color;

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const branding = await updateBranding(draft);
      setSaved(branding);
      setDraft(branding);
      setText(branding);
      rememberBranding(branding);
      setMessage("Branding saved. Every page picks it up on its next load.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save branding");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(defaultBranding);
    setText(defaultBranding);
    setMessage("");
  };

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <section>
      <header className="section-header">
        <div>
          <p className="eyebrow">Platform settings</p>
          <h1>Branding</h1>
        </div>
      </header>
      <p className="muted">Colours used by every screen of the app. Changes preview immediately here and apply to everyone once saved.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-notice" role="status">{message}</p> : null}

      <div className="branding-layout">
        <div className="branding-card" aria-label="Brand colours">
          <div className="branding-card-head">
            <span className="branding-card-icon"><Palette size={18} /></span>
            <div>
              <h2>Theme colours</h2>
              <p>Pick with the swatch or type a hex value.</p>
            </div>
          </div>
          {fields.map((field) => (
            <div className="branding-field" key={field.key}>
              <label className="branding-swatch" style={{ background: draft[field.key] }}>
                <input type="color" aria-label={`${field.label} picker`} value={draft[field.key]} onChange={(event) => change(field.key, event.target.value)} />
              </label>
              <div className="branding-field-copy">
                <strong>{field.label}</strong>
                <small>{field.help}</small>
              </div>
              <input
                className={`branding-hex${HEX.test(text[field.key]) ? "" : " is-invalid"}`}
                aria-label={`${field.label} hex value`}
                value={text[field.key]}
                maxLength={7}
                spellCheck={false}
                onChange={(event) => change(field.key, event.target.value)}
              />
            </div>
          ))}
          <div className="branding-actions">
            <button type="button" className="secondary-button" onClick={reset}><RotateCcw size={15} /> Reset to defaults</button>
            <button type="button" className="primary-button" disabled={!dirty || saving} onClick={() => void save()}>
              <Check size={15} /> {saving ? "Saving…" : "Save branding"}
            </button>
          </div>
        </div>

        <div className="branding-card branding-preview" aria-label="Preview">
          <div className="branding-card-head">
            <div>
              <h2>Preview</h2>
              <p>How common controls look with these colours.</p>
            </div>
          </div>
          <div className="branding-preview-row">
            <button type="button" className="primary-button">Primary action</button>
            <button type="button" className="secondary-button">Secondary</button>
            <span className="status-pill">Published</span>
          </div>
          <div className="branding-preview-row">
            <span className="ws-item is-active" style={{ width: "auto" }}>Active workspace <span className="ws-count">3</span></span>
            <a href="#preview" onClick={(event) => event.preventDefault()}>A text link</a>
          </div>
          <div className="branding-preview-nodes">
            <span className="branding-node" style={{ borderTopColor: draft.primary_color }}>Message node</span>
            <span className="branding-node" style={{ borderTopColor: draft.secondary_color }}>Logic node</span>
          </div>
        </div>
      </div>
    </section>
  );
}
