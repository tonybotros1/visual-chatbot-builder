"use client";

import { useEffect, useState, type ChangeEvent, type CSSProperties } from "react";
import { ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";
import { defaultFlowAppearance, useFlowStore } from "@/stores/flow-store";
import type { FlowAppearance } from "@/types/flow";

type ColorKey = "primary_color" | "background_color" | "surface_color" | "text_color";

const colorFields: Array<{ key: ColorKey; label: string }> = [
  { key: "primary_color", label: "Primary color" },
  { key: "background_color", label: "Background" },
  { key: "surface_color", label: "Bubble" },
  { key: "text_color", label: "Text color" },
];

const layoutChoices: Array<{ value: FlowAppearance["layout_style"]; label: string }> = [
  { value: "card", label: "Card" },
  { value: "personal", label: "Personal" },
  { value: "modern", label: "Modern" },
  { value: "minimal", label: "Minimal" },
  { value: "spotlight", label: "Spotlight" },
];

const presets = [
  { label: "Spaghetti", primary_color: "#7C3AED", background_color: "#FFFFFF", surface_color: "#FFFFFF", text_color: "#211D29" },
  { label: "Ocean", primary_color: "#0891B2", background_color: "#FFFFFF", surface_color: "#FFFFFF", text_color: "#164E63" },
  { label: "Forest", primary_color: "#16805D", background_color: "#FFFFFF", surface_color: "#FFFFFF", text_color: "#173A2B" },
];

function validHex(value: string) {
  return /^#[0-9A-F]{6}$/i.test(value);
}

function isPresetActive(appearance: FlowAppearance, preset: (typeof presets)[number]) {
  return colorFields.every((field) => appearance[field.key].toUpperCase() === preset[field.key]);
}

function HexColorField({
  colorKey,
  label,
  value,
  onChange,
}: {
  colorKey: ColorKey;
  label: string;
  value: string;
  onChange: (updates: Partial<FlowAppearance>) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const updateText = (nextValue: string) => {
    const normalized = nextValue.startsWith("#") ? nextValue : `#${nextValue}`;
    setDraft(normalized);
    if (validHex(normalized)) onChange({ [colorKey]: normalized.toUpperCase() });
  };

  return (
    <label className={`design-color-field${validHex(draft) ? "" : " is-invalid"}`}>
      <span className="design-color-swatch" style={{ background: validHex(value) ? value : "#000000" }}>
        <input
          type="color"
          value={validHex(value) ? value : "#000000"}
          onChange={(event) => onChange({ [colorKey]: event.target.value.toUpperCase() })}
          aria-label={`${label} picker`}
        />
      </span>
      <span className="design-color-meta">
        <span className="design-color-label">{label}</span>
        <input
          className="design-hex-input"
          aria-label={`${label} HEX value`}
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => updateText(event.target.value)}
          onBlur={() => {
            if (!validHex(draft)) setDraft(value);
          }}
        />
      </span>
    </label>
  );
}

export function DesignWorkspace() {
  const appearance = useFlowStore((state) => state.appearance);
  const updateAppearance = useFlowStore((state) => state.updateAppearance);
  const [avatarError, setAvatarError] = useState("");

  const uploadAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("Use an image smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateAppearance({ avatar_url: String(reader.result ?? "") });
      setAvatarError("");
    };
    reader.onerror = () => setAvatarError("The image could not be read.");
    reader.readAsDataURL(file);
  };

  const isSpotlight = appearance.layout_style === "spotlight";
  const previewVars = {
    color: appearance.text_color,
    background: appearance.surface_color,
    "--chat-avatar": appearance.avatar_url ? `url("${appearance.avatar_url}")` : "none",
  } as CSSProperties;
  // Spotlight draws its own grey bubbles and neutral pills, so it skips the inline theme colours.
  const messageStyle = isSpotlight ? { color: appearance.text_color } : { color: appearance.text_color, background: appearance.surface_color };
  const optionStyle = isSpotlight ? undefined : { color: appearance.primary_color, borderColor: appearance.primary_color };

  const avatar = appearance.avatar_url ? (
    <img src={appearance.avatar_url} alt="Chat profile" />
  ) : (
    <SpaghettiMark size={34} />
  );

  return (
    <section className="design-workspace">
      <aside className="design-controls">
        <div className="design-controls-heading">
          <div>
            <strong>Chat style</strong>
            <span>Changes update the preview immediately.</span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Reset chat style"
            title="Reset to defaults"
            onClick={() => updateAppearance(defaultFlowAppearance)}
          >
            <RotateCcw size={15} />
          </button>
        </div>

        <section className="design-section">
          <h3 className="design-section-title">Layout</h3>
          <div className="design-layouts" role="radiogroup" aria-label="Layout">
            {layoutChoices.map((layout) => (
              <button
                className={appearance.layout_style === layout.value ? "is-active" : ""}
                type="button"
                role="radio"
                aria-checked={appearance.layout_style === layout.value}
                key={layout.value}
                onClick={() => updateAppearance({ layout_style: layout.value })}
              >
                <span className={`layout-thumbnail layout-thumbnail-${layout.value}`}>
                  <i />
                  <b />
                  <em />
                </span>
                {layout.label}
              </button>
            ))}
          </div>
        </section>

        <section className="design-section">
          <h3 className="design-section-title">Content</h3>
          <div className="design-content-fields">
            <label>
              Chat title
              <input
                value={appearance.title}
                onChange={(event) => updateAppearance({ title: event.target.value })}
                placeholder="Spaghetti chatbot"
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={appearance.description}
                onChange={(event) => updateAppearance({ description: event.target.value })}
                placeholder="Tell visitors how you can help."
              />
            </label>
            <div className="design-avatar-field">
              <span className="design-avatar-preview">{avatar}</span>
              <span className="design-avatar-copy">
                <strong>Profile picture</strong>
                <small>Image up to 2 MB</small>
                {avatarError ? <small className="design-field-error">{avatarError}</small> : null}
              </span>
              <span className="design-avatar-actions">
                <label className="secondary-button" htmlFor="chat-avatar-upload">
                  <ImagePlus size={14} /> {appearance.avatar_url ? "Replace" : "Upload"}
                </label>
                <input id="chat-avatar-upload" type="file" accept="image/*" onChange={uploadAvatar} />
                {appearance.avatar_url ? (
                  <button className="mini-icon-button" type="button" aria-label="Remove profile picture" onClick={() => updateAppearance({ avatar_url: "" })}>
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </span>
            </div>
          </div>
        </section>

        <section className="design-section">
          <div className="design-section-head">
            <h3 className="design-section-title">Colors</h3>
            <div className="design-preset-chips" aria-label="Quick themes">
              {presets.map((preset) => (
                <button
                  className={isPresetActive(appearance, preset) ? "is-active" : ""}
                  type="button"
                  key={preset.label}
                  title={`Apply the ${preset.label} theme`}
                  onClick={() => updateAppearance(preset)}
                >
                  <span style={{ background: preset.primary_color }} />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="design-color-grid">
            {colorFields.map((field) => (
              <HexColorField
                colorKey={field.key}
                key={field.key}
                label={field.label}
                value={appearance[field.key]}
                onChange={updateAppearance}
              />
            ))}
          </div>
        </section>
      </aside>

      <div className="design-preview-stage" style={{ background: isSpotlight ? appearance.primary_color : "#FFFFFF" }}>
        <div className={`design-chat-preview design-style-${appearance.layout_style}`} style={previewVars}>
          <header style={{ background: appearance.primary_color }}>
            <span className="design-preview-avatar">{avatar}</span>
            <div>
              <strong>{appearance.title || "Spaghetti chatbot"}</strong>
              {appearance.description ? <span>{appearance.description}</span> : null}
            </div>
          </header>
          <div className="design-preview-conversation" style={{ background: appearance.background_color }}>
            <div className="design-preview-message" style={messageStyle}>
              Welcome! How can I help you today?
            </div>
            <div className="design-preview-options">
              <button style={optionStyle} type="button">Option one</button>
              <button style={optionStyle} type="button">Option two</button>
            </div>
          </div>
          <footer>
            <span>Type your answer…</span>
            <button style={{ background: appearance.primary_color }} type="button" aria-label="Preview send">→</button>
          </footer>
        </div>
      </div>
    </section>
  );
}
