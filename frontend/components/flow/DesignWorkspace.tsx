"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from "react";
import { ImagePlus, MessageCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";
import { darkenHex, defaultFlowAppearance, useFlowStore } from "@/stores/flow-store";
import type { FlowAppearance, PageLink } from "@/types/flow";

type ColorKey = "primary_color" | "background_color" | "surface_color" | "text_color" | "accent_color";

const colorFields: Array<{ key: ColorKey; label: string }> = [
  { key: "primary_color", label: "Primary color" },
  { key: "background_color", label: "Background" },
  { key: "surface_color", label: "Bubble" },
  { key: "text_color", label: "Text color" },
  { key: "accent_color", label: "Accent" },
];

const layoutChoices: Array<{ value: FlowAppearance["layout_style"]; label: string }> = [
  { value: "card", label: "Card" },
  { value: "personal", label: "Personal" },
  { value: "modern", label: "Modern" },
  { value: "spotlight", label: "Spotlight" },
];

const positionChoices: Array<{ value: FlowAppearance["widget_position"]; label: string }> = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

type DesignPanel = "widget" | "page";
type PreviewMode = "widget" | "page" | "embed";

const presets = [
  { label: "Spaghetti", primary_color: "#FBF59B", background_color: "#FFFFFF", surface_color: "#FFFFFF", text_color: "#211D29", accent_color: "#B0AC6D" },
  { label: "Ocean", primary_color: "#0891B2", background_color: "#FFFFFF", surface_color: "#FFFFFF", text_color: "#164E63", accent_color: "#065F73" },
  { label: "Forest", primary_color: "#16805D", background_color: "#FFFFFF", surface_color: "#FFFFFF", text_color: "#173A2B", accent_color: "#0F5A41" },
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

/** Built-in avatars shipped with the app (frontend/public/avatars). Picked ones are inlined like uploads. */
const AVATAR_PRESETS = [
  { id: "woman-1", label: "Woman" },
  { id: "man-1", label: "Man" },
  { id: "woman-hijab", label: "Woman with hijab" },
  { id: "man-beard", label: "Man with beard" },
  { id: "clinician", label: "Clinician" },
  { id: "robot", label: "Assistant robot" },
] as const;

const presetDataUrls = new Map<string, string>();

async function presetDataUrl(id: string): Promise<string> {
  const cached = presetDataUrls.get(id);
  if (cached) return cached;
  const response = await fetch(`/avatars/${id}.svg`);
  if (!response.ok) throw new Error("preset unavailable");
  const text = await response.text();
  const dataUrl = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(text)))}`;
  presetDataUrls.set(id, dataUrl);
  return dataUrl;
}

function AvatarPresets({ current, onPick }: { current: string; onPick: (dataUrl: string) => void }) {
  const [active, setActive] = useState<string | null>(null);
  // Work out which preset (if any) the current picture is, so it can show as selected.
  useEffect(() => {
    let cancelled = false;
    if (!current.startsWith("data:image/svg+xml")) {
      setActive(null);
      return;
    }
    Promise.all(AVATAR_PRESETS.map(async (preset) => [preset.id, await presetDataUrl(preset.id)] as const))
      .then((pairs) => {
        if (cancelled) return;
        setActive(pairs.find(([, dataUrl]) => dataUrl === current)?.[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setActive(null);
      });
    return () => {
      cancelled = true;
    };
  }, [current]);
  return (
    <div className="design-avatar-presets" role="group" aria-label="Default avatars">
      <small>Or pick a default avatar</small>
      <div className="design-avatar-preset-row">
        {AVATAR_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={active === preset.id ? "is-active" : ""}
            title={preset.label}
            aria-label={preset.label}
            aria-pressed={active === preset.id}
            onClick={() => void presetDataUrl(preset.id).then(onPick).catch(() => undefined)}
          >
            <img src={`/avatars/${preset.id}.svg`} alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_AVATAR_EDGE = 512;
const INLINE_LIMIT_BYTES = 2 * 1024 * 1024;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Downscale a picture to at most 512px on its long edge and return it as a data URL. */
async function prepareAvatarImage(file: File): Promise<string> {
  // Vector and animated images cannot be rasterised without losing what makes them useful; keep them when small.
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    if (file.size > INLINE_LIMIT_BYTES) throw new Error("too large");
    return readAsDataUrl(file);
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_AVATAR_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(bitmap, 0, 0, width, height);
    const keepAlpha = file.type === "image/png" || file.type === "image/webp";
    return canvas.toDataURL(keepAlpha ? "image/png" : "image/jpeg", 0.9);
  } finally {
    bitmap.close();
  }
}

export function DesignWorkspace() {
  const appearance = useFlowStore((state) => state.appearance);
  const updateAppearance = useFlowStore((state) => state.updateAppearance);
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const [avatarError, setAvatarError] = useState("");
  const [replyAvatarError, setReplyAvatarError] = useState("");
  const [panel, setPanel] = useState<DesignPanel>("page");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("page");

  // Both pictures are stored inline on the appearance as data URLs. Large photos are downscaled in the
  // browser first (avatars render at ~40px), so the stored image stays small whatever the source size.
  const makeUpload = (key: "avatar_url" | "reply_avatar_url", setError: (message: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError(`Use an image smaller than ${MAX_SOURCE_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    prepareAvatarImage(file)
      .then((dataUrl) => {
        updateAppearance({ [key]: dataUrl });
        setError("");
      })
      .catch(() => setError("The image could not be read."));
  };
  const uploadAvatar = makeUpload("avatar_url", setAvatarError);
  const uploadReplyAvatar = makeUpload("reply_avatar_url", setReplyAvatarError);

  const previewVars = {
    color: appearance.text_color,
    background: appearance.surface_color,
    "--chat-accent": appearance.accent_color || appearance.primary_color,
  } as CSSProperties;
  const isSpotlight = appearance.layout_style === "spotlight";
  // Spotlight draws its own grey bubbles and neutral pills, so it skips the inline theme colours.
  const messageStyle = isSpotlight ? { color: appearance.text_color } : { color: appearance.text_color, background: appearance.surface_color };
  const optionStyle = isSpotlight ? undefined : { color: appearance.primary_color, borderColor: appearance.primary_color };

  const avatar = appearance.avatar_url ? (
    <img src={appearance.avatar_url} alt="Chat profile" />
  ) : (
    <SpaghettiMark size={34} />
  );
  const replyMode = appearance.reply_avatar ?? "profile";
  const replyAvatarUrl = replyMode === "custom" && appearance.reply_avatar_url ? appearance.reply_avatar_url : appearance.avatar_url;
  const replyAvatar = replyAvatarUrl ? <img src={replyAvatarUrl} alt="" /> : <SpaghettiMark size={22} title="" />;
  const replyChoices: { value: FlowAppearance["reply_avatar"]; label: string }[] = [
    { value: "profile", label: "Profile" },
    { value: "custom", label: "Custom" },
    { value: "hidden", label: "Hidden" },
  ];

  // The first question after Start doubles as the widget's welcome message.
  const firstQuestion = useMemo(() => {
    const start = nodes.find((node) => node.type === "start");
    const targets = new Set(edges.filter((edge) => edge.source === start?.id).map((edge) => edge.target));
    const next = nodes.find((node) => targets.has(node.id));
    // Questions may carry rich text; the preview and the widget teaser show plain words.
    const label = typeof next?.data?.label === "string" ? next.data.label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
    return label || "Welcome! How can I help you today?";
  }, [nodes, edges]);

  const links = appearance.links ?? [];
  const visibleLinks = links.filter((link) => link.url.trim());
  const updateLink = (index: number, patch: Partial<PageLink>) =>
    updateAppearance({ links: links.map((link, position) => (position === index ? { ...link, ...patch } : link)) });
  const removeLink = (index: number) => updateAppearance({ links: links.filter((_, position) => position !== index) });
  const addLink = () => updateAppearance({ links: [...links, { label: "", url: "" }] });

  const choosePanel = (next: DesignPanel) => {
    setPanel(next);
    setPreviewMode(next);
  };
  const onPrimaryChange = (updates: Partial<FlowAppearance>) =>
    updateAppearance(updates.primary_color ? { ...updates, accent_color: darkenHex(updates.primary_color, 0.3) } : updates);

  const previewCard = (variant = "") => (
    <div className={`design-chat-preview design-style-${appearance.layout_style}${replyMode !== "hidden" ? " has-reply-avatar" : ""}${variant}`} style={previewVars}>
      <header style={{ background: appearance.primary_color }}>
        <span className="design-preview-avatar">{avatar}</span>
        <div>
          <strong>{appearance.title || "Spaghetti chatbot"}</strong>
          {appearance.description ? <span>{appearance.description}</span> : null}
          {visibleLinks.length ? (
            <nav className="chat-header-links" aria-label="Links">
              {visibleLinks.map((link, index) => (
                <a key={`${link.url}-${index}`} href={link.url} onClick={(event) => event.preventDefault()}>{link.label || link.url}</a>
              ))}
            </nav>
          ) : null}
        </div>
      </header>
      <div className="design-preview-conversation" style={{ background: appearance.background_color }}>
        <div className="design-preview-message" style={messageStyle}>
          {replyMode !== "hidden" ? <span className="chat-reply-avatar" aria-hidden="true">{replyAvatar}</span> : null}
          {firstQuestion}
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

        <div className="design-card">
          <div className="design-avatar-row">
            <div>
              <strong>Avatar</strong>
              <small>Shown beside replies and on the widget launcher</small>
            </div>
            <span className="design-avatar-preview design-avatar-large">{replyMode === "hidden" ? <SpaghettiMark size={22} title="" /> : replyAvatar}</span>
          </div>
          <div className="design-segment" role="group" aria-label="Avatar">
            {replyChoices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                className={replyMode === choice.value ? "is-active" : ""}
                aria-pressed={replyMode === choice.value}
                onClick={() => updateAppearance({ reply_avatar: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>
          {replyMode === "custom" ? (
            <div className="design-avatar-field">
              <span className="design-avatar-preview">{appearance.reply_avatar_url ? <img src={appearance.reply_avatar_url} alt="Reply avatar" /> : <SpaghettiMark size={34} />}</span>
              <span className="design-avatar-copy">
                <strong>Avatar image</strong>
                <small>{appearance.reply_avatar_url ? "Any image up to 25 MB; resized to fit" : "Uses the profile picture until you upload one"}</small>
                {replyAvatarError ? <small className="design-field-error">{replyAvatarError}</small> : null}
              </span>
              <span className="design-avatar-actions">
                <label className="secondary-button" htmlFor="chat-reply-avatar-upload">
                  <ImagePlus size={14} /> {appearance.reply_avatar_url ? "Replace" : "Upload"}
                </label>
                <input id="chat-reply-avatar-upload" type="file" accept="image/*" onChange={uploadReplyAvatar} />
                {appearance.reply_avatar_url ? (
                  <button className="mini-icon-button" type="button" aria-label="Remove avatar image" onClick={() => updateAppearance({ reply_avatar_url: "" })}>
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </span>
            </div>
          ) : null}
          {replyMode === "custom" ? (
            <AvatarPresets current={appearance.reply_avatar_url} onPick={(dataUrl) => { updateAppearance({ reply_avatar_url: dataUrl }); setReplyAvatarError(""); }} />
          ) : null}

          <div className="design-theme-row">
            <strong>Theme color</strong>
            <HexColorField colorKey="primary_color" label="Primary" value={appearance.primary_color} onChange={onPrimaryChange} />
          </div>
          <details className="design-more-colors">
            <summary>More colours</summary>
            <div className="design-more-colors-body">
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
              <div className="design-color-grid">
                {colorFields.filter((field) => field.key !== "primary_color").map((field) => (
                  <HexColorField
                    colorKey={field.key}
                    key={field.key}
                    label={field.label}
                    value={appearance[field.key]}
                    onChange={updateAppearance}
                  />
                ))}
              </div>
            </div>
          </details>
        </div>

        <div className="design-card design-card-tabbed">
          <div className="design-card-tabs" role="tablist" aria-label="Design area">
            <button type="button" role="tab" aria-selected={panel === "widget"} className={panel === "widget" ? "is-active" : ""} onClick={() => choosePanel("widget")}>Widget</button>
            <button type="button" role="tab" aria-selected={panel === "page"} className={panel === "page" ? "is-active" : ""} onClick={() => choosePanel("page")}>Page</button>
          </div>
          <div className="design-card-body">
            {panel === "widget" ? (
              <>
                <div className="design-layouts design-layouts-three" role="radiogroup" aria-label="Widget position">
                  {positionChoices.map((choice) => (
                    <button
                      className={appearance.widget_position === choice.value ? "is-active" : ""}
                      type="button"
                      role="radio"
                      aria-checked={appearance.widget_position === choice.value}
                      key={choice.value}
                      onClick={() => updateAppearance({ widget_position: choice.value })}
                    >
                      <span className={`position-thumbnail position-thumbnail-${choice.value}`}><i /></span>
                      {choice.label}
                    </button>
                  ))}
                </div>
                <div className="design-toggle-row">
                  <div>
                    <strong>Show welcome message</strong>
                    <small>Set first question as a welcome message</small>
                  </div>
                  <button
                    className={`settings-toggle${appearance.widget_welcome ? " is-on" : ""}`}
                    type="button"
                    role="switch"
                    aria-checked={appearance.widget_welcome}
                    aria-label="Show welcome message"
                    onClick={() => updateAppearance({ widget_welcome: !appearance.widget_welcome })}
                  >
                    <span />
                  </button>
                </div>
              </>
            ) : (
              <>
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
                <div className="design-content-fields">
                  <label>
                    Title
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
                      placeholder="Description"
                    />
                  </label>
                  <div className="design-avatar-field">
                    <span className="design-avatar-preview">{avatar}</span>
                    <span className="design-avatar-copy">
                      <strong>Profile picture</strong>
                      <small>Upload a logo for the page</small>
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
                  <div className="design-links">
                    <div className="design-links-head">
                      <strong>Links</strong>
                      <button className="secondary-button" type="button" onClick={addLink}><Plus size={14} /> Add link</button>
                    </div>
                    {links.map((link, index) => (
                      <div className="design-link-row" key={index}>
                        <input aria-label={`Link ${index + 1} label`} placeholder="Label" value={link.label} onChange={(event) => updateLink(index, { label: event.target.value })} />
                        <input aria-label={`Link ${index + 1} address`} placeholder="https://example.com" value={link.url} spellCheck={false} onChange={(event) => updateLink(index, { url: event.target.value })} />
                        <button className="mini-icon-button" type="button" aria-label={`Remove link ${index + 1}`} onClick={() => removeLink(index)}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      <div className="design-preview-stage">
        <div className="design-browser">
          <div className="design-browser-bar">
            <span className="design-browser-dots" aria-hidden="true"><i /><i /><i /></span>
            <div className="design-preview-tabs" role="tablist" aria-label="Preview">
              {(["widget", "page", "embed"] as PreviewMode[]).map((mode) => (
                <button key={mode} type="button" role="tab" aria-selected={previewMode === mode} className={previewMode === mode ? "is-active" : ""} onClick={() => setPreviewMode(mode)}>
                  {mode === "widget" ? "Widget" : mode === "page" ? "Page" : "Embed"}
                </button>
              ))}
            </div>
          </div>
          <div className={`design-browser-body design-browser-${previewMode}`} style={isSpotlight && previewMode === "page" ? { background: appearance.primary_color } : undefined}>
            {previewMode === "page" ? previewCard() : null}
            {previewMode === "embed" ? (
              <div className="design-skeleton">
                <i /><i />
                <div className="design-skeleton-embed">{previewCard(" is-embedded")}</div>
                <i /><i />
              </div>
            ) : null}
            {previewMode === "widget" ? (
              <div className="design-skeleton">
                <i /><i /><i /><i />
                <div className={`design-widget-mock is-${appearance.widget_position}`}>
                  {appearance.widget_welcome ? <div className="design-widget-popup">{previewCard(" is-popup")}</div> : null}
                  {appearance.widget_position === "center" ? (
                    <div className="design-widget-bar" aria-label="Widget launcher bar">
                      <span className="design-widget-bar-avatar" style={{ background: appearance.primary_color }}>
                        {replyMode !== "hidden" && replyAvatarUrl ? <img src={replyAvatarUrl} alt="" /> : <MessageCircle size={18} />}
                      </span>
                      <span className="design-widget-bar-text">Tap an option</span>
                      <span className="design-widget-bar-send" style={{ background: appearance.primary_color }}>↑</span>
                    </div>
                  ) : (
                    <button type="button" className="design-widget-launcher" style={{ background: appearance.primary_color }} aria-label="Widget launcher">
                      {replyMode !== "hidden" && replyAvatarUrl ? <img src={replyAvatarUrl} alt="" /> : <MessageCircle size={26} />}
                      <i />
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
