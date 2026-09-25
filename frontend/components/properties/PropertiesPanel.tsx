import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bold, Check, ChevronDown, ImagePlus, Italic, Link2, List, ListOrdered, Plus, Strikethrough, Trash2, Underline, X } from "lucide-react";
import { listSubflows, listSubflowVersions } from "@/services/subflows";
import { listLogicAssets, listLogicVersions } from "@/services/logic";
import { listIntegrations } from "@/services/integrations";
import { useFlowStore } from "@/stores/flow-store";
import { richTextToPlainText, richTextToSafeHtml } from "@/components/content/RichText";
import type { IntegrationConnection, LogicAssetRecord, LogicVersion, SubflowRecord, SubflowVersion } from "@/types/api";

const inputTypes = new Set([
  "textInput",
  "numberInput",
  "emailInput",
  "phoneInput",
  "singleChoice",
  "choice",
  "multipleChoice",
  "searchableList",
  "rangeInput",
  "ratingInput",
  "opinionScale",
  "dateInput",
  "fileUpload",
  "payment",
  "appointment",
]);
const choiceTypes = new Set(["singleChoice", "choice", "multipleChoice", "searchableList"]);
const numericTypes = new Set(["numberInput", "rangeInput", "ratingInput", "opinionScale"]);
const terminalTypes = new Set(["end", "thankYou", "whatsappRedirect", "return"]);

const linkTypeOptions = [
  { value: "website", label: "Website", destinationLabel: "Website URL", placeholder: "https://example.com", inputType: "url", inputMode: "url" },
  { value: "email", label: "Email", destinationLabel: "Email address", placeholder: "name@example.com", inputType: "email", inputMode: "email" },
  { value: "phone", label: "Phone", destinationLabel: "Phone number", placeholder: "+971 50 123 4567", inputType: "tel", inputMode: "tel" },
  { value: "twitter", label: "Twitter / X", destinationLabel: "X profile URL", placeholder: "https://x.com/username", inputType: "url", inputMode: "url" },
  { value: "facebook", label: "Facebook", destinationLabel: "Facebook page URL", placeholder: "https://facebook.com/page", inputType: "url", inputMode: "url" },
  { value: "instagram", label: "Instagram", destinationLabel: "Instagram profile URL", placeholder: "https://instagram.com/username", inputType: "url", inputMode: "url" },
  { value: "threads", label: "Threads", destinationLabel: "Threads profile URL", placeholder: "https://threads.net/@username", inputType: "url", inputMode: "url" },
  { value: "medium", label: "Medium", destinationLabel: "Medium profile URL", placeholder: "https://medium.com/@username", inputType: "url", inputMode: "url" },
  { value: "product_hunt", label: "Product Hunt", destinationLabel: "Product Hunt URL", placeholder: "https://producthunt.com/products/name", inputType: "url", inputMode: "url" },
  { value: "linkedin", label: "LinkedIn", destinationLabel: "LinkedIn profile URL", placeholder: "https://linkedin.com/in/username", inputType: "url", inputMode: "url" },
  { value: "snapchat", label: "Snapchat", destinationLabel: "Snapchat profile URL", placeholder: "https://snapchat.com/add/username", inputType: "url", inputMode: "url" },
  { value: "telegram", label: "Telegram", destinationLabel: "Telegram URL", placeholder: "https://t.me/username", inputType: "url", inputMode: "url" },
  { value: "reach_at", label: "Reach.at", destinationLabel: "Reach.at URL", placeholder: "https://reach.at/name", inputType: "url", inputMode: "url" },
  { value: "slack", label: "Slack", destinationLabel: "Slack URL", placeholder: "https://workspace.slack.com", inputType: "url", inputMode: "url" },
  { value: "skype", label: "Skype", destinationLabel: "Skype URL", placeholder: "https://join.skype.com/invite", inputType: "url", inputMode: "url" },
  { value: "pinterest", label: "Pinterest", destinationLabel: "Pinterest profile URL", placeholder: "https://pinterest.com/username", inputType: "url", inputMode: "url" },
  { value: "deviantart", label: "DeviantArt", destinationLabel: "DeviantArt profile URL", placeholder: "https://deviantart.com/username", inputType: "url", inputMode: "url" },
  { value: "tiktok", label: "TikTok", destinationLabel: "TikTok profile URL", placeholder: "https://tiktok.com/@username", inputType: "url", inputMode: "url" },
  { value: "twitch", label: "Twitch", destinationLabel: "Twitch channel URL", placeholder: "https://twitch.tv/username", inputType: "url", inputMode: "url" },
  { value: "quora", label: "Quora", destinationLabel: "Quora profile URL", placeholder: "https://quora.com/profile/name", inputType: "url", inputMode: "url" },
  { value: "soundcloud", label: "SoundCloud", destinationLabel: "SoundCloud profile URL", placeholder: "https://soundcloud.com/username", inputType: "url", inputMode: "url" },
  { value: "spotify", label: "Spotify", destinationLabel: "Spotify URL", placeholder: "https://open.spotify.com/artist/id", inputType: "url", inputMode: "url" },
  { value: "youtube", label: "YouTube", destinationLabel: "YouTube channel URL", placeholder: "https://youtube.com/@channel", inputType: "url", inputMode: "url" },
  { value: "whatsapp", label: "WhatsApp", destinationLabel: "WhatsApp number", placeholder: "+971 50 123 4567", inputType: "tel", inputMode: "tel" },
] as const;

function linkDestinationConfig(linkType?: string) {
  return linkTypeOptions.find((option) => option.value === linkType) ?? linkTypeOptions[0];
}

function optionalNumber(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

type SpaghettiSelectOption = {
  value: string;
  label: string;
};

function SpaghettiSelect({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: string;
  options: readonly SpaghettiSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`spaghetti-select${open ? " is-open" : ""}`} ref={root}>
      <button
        className="spaghetti-select-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? "Choose an option"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="spaghetti-select-menu" role="listbox" aria-label={`${ariaLabel} options`}>
          {options.map((option) => (
            <button
              className="spaghetti-select-option"
              type="button"
              role="option"
              aria-selected={option.value === value}
              title={option.label}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={14} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function safeEditorLink(url: string) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : "";
}

function safeEditorImage(url: string) {
  return /^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(url) ? url : "";
}

function serializeEditorNode(domNode: Node): string {
  if (domNode.nodeType === 3) return (domNode.textContent ?? "").replace(/\u00a0/g, " ");
  if (!(domNode instanceof HTMLElement)) return "";

  const children = Array.from(domNode.childNodes).map(serializeEditorNode).join("");
  switch (domNode.tagName.toLowerCase()) {
    case "br": return "\n";
    case "div":
    case "p": return `${children}\n`;
    case "b":
    case "strong": return `<strong>${children}</strong>`;
    case "i":
    case "em": return `<em>${children}</em>`;
    case "u": return `<u>${children}</u>`;
    case "s":
    case "strike": return `<s>${children}</s>`;
    case "ul": return `<ul>${children}</ul>`;
    case "ol": return `<ol>${children}</ol>`;
    case "li": return `<li>${children}</li>`;
    case "a": {
      const url = safeEditorLink(domNode.getAttribute("href") ?? "");
      return url ? `<a href="${url.replace(/"/g, "&quot;")}">${children}</a>` : children;
    }
    case "img": {
      const url = safeEditorImage(domNode.getAttribute("src") ?? "");
      const alt = (domNode.getAttribute("alt") || "Message image").replace(/"/g, "&quot;");
      return url ? `<img src="${url.replace(/"/g, "&quot;")}" alt="${alt}">` : alt;
    }
    default: return children;
  }
}

function serializeLabelEditor(editor: HTMLElement) {
  return Array.from(editor.childNodes)
    .map(serializeEditorNode)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/, "");
}

export function PropertiesPanel() {
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const updateNodeData = useFlowStore((state) => state.updateNodeData);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const setJumpTarget = useFlowStore((state) => state.setJumpTarget);
  const selectNode = useFlowStore((state) => state.selectNode);
  const node = nodes.find((item) => item.id === selectedNodeId);
  const [subflows, setSubflows] = useState<SubflowRecord[]>([]);
  const [versions, setVersions] = useState<SubflowVersion[]>([]);
  const [dependencyError, setDependencyError] = useState("");
  const [logicAssets, setLogicAssets] = useState<LogicAssetRecord[]>([]);
  const [logicVersions, setLogicVersions] = useState<LogicVersion[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [labelMediaError, setLabelMediaError] = useState("");
  const labelEditor = useRef<HTMLDivElement>(null);
  const savedLabelSelection = useRef<Range | null>(null);

  useEffect(() => {
    if (!node || !["fileUpload", "payment", "appointment", "phoneInput"].includes(node.type)) return;
    listIntegrations().then(setConnections).catch((caught) => setDependencyError(caught instanceof Error ? caught.message : "Could not load provider connections"));
  }, [node?.type]);

  useEffect(() => {
    if (node?.type !== "subflow") return;
    listSubflows()
      .then(setSubflows)
      .catch((caught) => setDependencyError(caught instanceof Error ? caught.message : "Could not load components"));
  }, [node?.type]);

  useEffect(() => {
    if (node?.type !== "subflow" || !node.data.subflow_id) {
      setVersions([]);
      return;
    }
    listSubflowVersions(node.data.subflow_id)
      .then(setVersions)
      .catch((caught) => setDependencyError(caught instanceof Error ? caught.message : "Could not load versions"));
  }, [node?.data.subflow_id, node?.type]);

  useEffect(() => {
    if (node?.type !== "ruleSet" && node?.type !== "decisionTable") return;
    const kind = node.type === "ruleSet" ? "rule_set" : "decision_table";
    listLogicAssets(kind)
      .then(setLogicAssets)
      .catch((caught) => setDependencyError(caught instanceof Error ? caught.message : "Could not load logic assets"));
  }, [node?.type]);

  useEffect(() => {
    if ((node?.type !== "ruleSet" && node?.type !== "decisionTable") || !node.data.logic_asset_id) {
      setLogicVersions([]);
      return;
    }
    listLogicVersions(node.data.logic_asset_id)
      .then(setLogicVersions)
      .catch((caught) => setDependencyError(caught instanceof Error ? caught.message : "Could not load logic versions"));
  }, [node?.data.logic_asset_id, node?.type]);

  useEffect(() => {
    if (!node) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") selectNode(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [node, selectNode]);

  useEffect(() => {
    const editor = labelEditor.current;
    if (!editor || !node) return;
    editor.innerHTML = richTextToSafeHtml(node.data.label);
    savedLabelSelection.current = null;
  }, [node?.id]);

  if (!node) return null;

  const rememberLabelSelection = () => {
    const editor = labelEditor.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedLabelSelection.current = range.cloneRange();
  };

  const restoreLabelSelection = () => {
    const editor = labelEditor.current;
    if (!editor) return;
    const selection = window.getSelection();
    const range = savedLabelSelection.current ?? document.createRange();
    if (!savedLabelSelection.current) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const syncLabelFromEditor = () => {
    const editor = labelEditor.current;
    if (!editor) return;
    updateNodeData(node.id, { label: serializeLabelEditor(editor) });
    rememberLabelSelection();
  };

  const applyLabelCommand = (command: string, value?: string) => {
    const editor = labelEditor.current;
    if (!editor) return;
    editor.focus();
    restoreLabelSelection();
    document.execCommand(command, false, value);
    syncLabelFromEditor();
  };

  const applyLabelLink = () => {
    restoreLabelSelection();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setLabelMediaError("Select the text you want to turn into a link.");
      return;
    }
    const entered = window.prompt("Enter the link URL", "https://");
    if (!entered) return;
    const candidate = /^(?:https?:\/\/|mailto:|tel:)/i.test(entered) ? entered : `https://${entered}`;
    const url = safeEditorLink(candidate);
    if (!url) {
      setLabelMediaError("Use an HTTP, HTTPS, email, or telephone link.");
      return;
    }
    setLabelMediaError("");
    applyLabelCommand("createLink", url);
  };

  const uploadLabelImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLabelMediaError("Choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLabelMediaError("Use an image no larger than 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const editor = labelEditor.current;
      if (!editor) return;
      editor.focus();
      restoreLabelSelection();
      const source = String(reader.result ?? "");
      document.execCommand("insertImage", false, source);
      const inserted = Array.from(editor.querySelectorAll("img")).find((image) => image.src === source);
      if (inserted) inserted.alt = file.name;
      syncLabelFromEditor();
      setLabelMediaError("");
    };
    reader.onerror = () => setLabelMediaError("The image could not be read.");
    reader.readAsDataURL(file);
  };

  const options = node.data.options ?? [];
  const isBranchingJump = ["choice", "singleChoice", "multipleChoice", "condition"].includes(node.type);
  const jumpRoutes = node.type === "condition"
    ? [{ handle: "true", label: "True" }, { handle: "false", label: "False" }]
    : ["choice", "singleChoice", "multipleChoice"].includes(node.type)
      ? [
          ...options.map((option, index) => ({ handle: `option-${index}`, label: option || `Option ${index + 1}` })),
          ...(node.data.required === false ? [{ handle: "skip", label: "Skip" }] : []),
        ]
      : [{ handle: null, label: "Next" }];
  const jumpTargets = nodes
    .filter((item) => item.id !== node.id)
    .slice()
    .sort((left, right) => (left.data.node_number ?? 0) - (right.data.node_number ?? 0));

  const applyVersion = (version: SubflowVersion | undefined, subflow?: SubflowRecord) => {
    if (!version) {
      updateNodeData(node.id, {
        subflow_version_id: undefined,
        version_number: undefined,
        input_schema: {},
        output_schema: {},
        inputs: {},
        outputs: {},
      });
      return;
    }
    updateNodeData(node.id, {
      label: subflow?.name ?? node.data.subflow_name ?? "Reusable component",
      subflow_id: subflow?.id ?? version.subflow_id,
      subflow_name: subflow?.name ?? node.data.subflow_name,
      subflow_version_id: version.id,
      version_number: version.version_number,
      input_schema: version.input_schema,
      output_schema: version.output_schema,
      inputs: Object.fromEntries(Object.keys(version.input_schema).map((name) => [name, `{{${name}}}`])),
      outputs: Object.fromEntries(Object.keys(version.output_schema).map((name) => [name, name])),
    });
  };

  const applyLogicVersion = (version: LogicVersion | undefined, asset?: LogicAssetRecord) => {
    if (!version) {
      updateNodeData(node.id, {
        logic_version_id: undefined,
        version_number: undefined,
        input_schema: {},
        output_schema: {},
        inputs: {},
        outputs: {},
      });
      return;
    }
    updateNodeData(node.id, {
      label: asset?.name ?? node.data.logic_name ?? "Reusable logic",
      logic_asset_id: asset?.id ?? version.logic_asset_id,
      logic_name: asset?.name ?? node.data.logic_name,
      logic_kind: asset?.kind ?? node.data.logic_kind,
      logic_version_id: version.id,
      version_number: version.version_number,
      input_schema: version.input_schema,
      output_schema: version.output_schema,
      inputs: Object.fromEntries(Object.keys(version.input_schema).map((name) => [name, `{{${name}}}`])),
      outputs: Object.fromEntries(Object.keys(version.output_schema).map((name) => [name, name])),
    });
  };

  return (
    <div
      className="properties-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) selectNode(null);
      }}
      role="presentation"
    >
      <section className="properties-modal" role="dialog" aria-modal="true" aria-labelledby="properties-modal-title">
        <div className="panel-heading">
          <div className="properties-modal-title">
            <span id="properties-modal-title">Node properties</span>
            <small className="node-kind-badge">#{node.data.node_number} · {node.type}</small>
          </div>
          <button className="icon-button" type="button" aria-label="Close node properties" onClick={() => selectNode(null)}>
            <X size={17} />
          </button>
        </div>
        <div className="properties-form">
        <div className="property-label-editor">
          <label id={`node-label-title-${node.id}`} htmlFor={`node-label-${node.id}`}>Label</label>
          <div className="label-format-toolbar" role="toolbar" aria-label="Label formatting">
            <button type="button" title="Bold" aria-label="Bold" onMouseDown={(event) => { rememberLabelSelection(); event.preventDefault(); }} onClick={() => applyLabelCommand("bold")}><Bold size={15} /></button>
            <button type="button" title="Italic" aria-label="Italic" onMouseDown={(event) => { rememberLabelSelection(); event.preventDefault(); }} onClick={() => applyLabelCommand("italic")}><Italic size={15} /></button>
            <button type="button" title="Underline" aria-label="Underline" onMouseDown={(event) => { rememberLabelSelection(); event.preventDefault(); }} onClick={() => applyLabelCommand("underline")}><Underline size={15} /></button>
            <button type="button" title="Strike through" aria-label="Strike through" onMouseDown={(event) => { rememberLabelSelection(); event.preventDefault(); }} onClick={() => applyLabelCommand("strikeThrough")}><Strikethrough size={15} /></button>
            <span className="label-toolbar-divider" />
            <button type="button" title="Bulleted list" aria-label="Bulleted list" onMouseDown={(event) => { rememberLabelSelection(); event.preventDefault(); }} onClick={() => applyLabelCommand("insertUnorderedList")}><List size={15} /></button>
            <button type="button" title="Numbered list" aria-label="Numbered list" onMouseDown={(event) => { rememberLabelSelection(); event.preventDefault(); }} onClick={() => applyLabelCommand("insertOrderedList")}><ListOrdered size={15} /></button>
            <button type="button" title="Link" aria-label="Link" onMouseDown={(event) => { rememberLabelSelection(); event.preventDefault(); }} onClick={applyLabelLink}><Link2 size={15} /></button>
            <label className="label-image-button" title="Add image" aria-label="Add image" onMouseDown={rememberLabelSelection}>
              <ImagePlus size={15} />
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  uploadLabelImage(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <div
            id={`node-label-${node.id}`}
            ref={labelEditor}
            className="label-rich-editor"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-labelledby={`node-label-title-${node.id}`}
            aria-multiline="true"
            data-placeholder="Type the node text…"
            onInput={syncLabelFromEditor}
            onKeyUp={rememberLabelSelection}
            onMouseUp={rememberLabelSelection}
            onBlur={syncLabelFromEditor}
          />
          {labelMediaError ? <small className="label-format-error">{labelMediaError}</small> : null}
        </div>

        {inputTypes.has(node.type) ? (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={node.data.required ?? true}
              onChange={(event) => updateNodeData(node.id, { required: event.target.checked })}
            />
            Answer is required
          </label>
        ) : null}

        {choiceTypes.has(node.type) ? (
          <fieldset>
            <legend>Options</legend>
            {options.map((option, index) => (
              <label className="option-field" key={index}>
                <span>{index + 1}</span>
                <input
                  value={option}
                  placeholder="Label"
                  onChange={(event) => {
                    const nextOptions = options.slice();
                    nextOptions[index] = event.target.value;
                    updateNodeData(node.id, {
                      options: nextOptions,
                      option_values: nextOptions,
                    });
                  }}
                />
                {options.length > 1 ? (
                  <button
                    className="mini-icon-button"
                    type="button"
                    aria-label={`Remove option ${index + 1}`}
                    onClick={() =>
                      updateNodeData(node.id, {
                        options: options.filter((_, itemIndex) => itemIndex !== index),
                        option_values: options.filter((_, itemIndex) => itemIndex !== index),
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </label>
            ))}
            <button
              className="secondary-button add-option-button"
              type="button"
              onClick={() => {
                const nextOptions = [...options, `Option ${options.length + 1}`];
                updateNodeData(node.id, { options: nextOptions, option_values: nextOptions });
              }}
            >
              <Plus size={14} /> Add option
            </button>
          </fieldset>
        ) : null}

        {node.type === "textInput" ? (
          <fieldset>
            <legend>Text validation</legend>
            <div className="property-grid-two">
              <label>Minimum length<input type="number" min={0} value={node.data.min_length ?? ""} onChange={(event) => updateNodeData(node.id, { min_length: optionalNumber(event.target.value) })} /></label>
              <label>Maximum length<input type="number" min={1} value={node.data.max_length ?? ""} onChange={(event) => updateNodeData(node.id, { max_length: optionalNumber(event.target.value) })} /></label>
            </div>
            <label>Regular expression<input value={node.data.pattern ?? ""} placeholder="^[A-Z].+$" onChange={(event) => updateNodeData(node.id, { pattern: event.target.value })} /></label>
            <label>Error message<input value={node.data.pattern_message ?? ""} placeholder="Enter a valid value" onChange={(event) => updateNodeData(node.id, { pattern_message: event.target.value })} /></label>
          </fieldset>
        ) : null}

        {numericTypes.has(node.type) ? (
          <fieldset>
            <legend>Numeric limits</legend>
            <div className="property-grid-three">
              <label>Minimum<input type="number" value={node.data.min_value ?? ""} onChange={(event) => updateNodeData(node.id, { min_value: optionalNumber(event.target.value) })} /></label>
              <label>Maximum<input type="number" value={node.data.max_value ?? ""} onChange={(event) => updateNodeData(node.id, { max_value: optionalNumber(event.target.value) })} /></label>
              <label>Step<input type="number" min="0.000001" step="any" value={node.data.step ?? ""} onChange={(event) => updateNodeData(node.id, { step: optionalNumber(event.target.value) })} /></label>
            </div>
          </fieldset>
        ) : null}

        {node.type === "emailInput" ? (
          <label>
            Allowed domains <small>comma separated; blank allows all</small>
            <input
              value={(node.data.allowed_domains ?? []).join(", ")}
              placeholder="example.com, company.org"
              onChange={(event) => updateNodeData(node.id, { allowed_domains: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
            />
          </label>
        ) : null}

        {node.type === "phoneInput" ? (
          <><label className="checkbox-field">
            <input type="checkbox" checked={node.data.otp_required ?? false} onChange={(event) => updateNodeData(node.id, { otp_required: event.target.checked })} />
            Require SMS OTP
          </label>{node.data.otp_required ? <label>SMS connection<SpaghettiSelect ariaLabel="SMS connection" value={node.data.provider_connection_id ?? ""} options={[{ value: "", label: "Choose SMS provider" }, ...connections.filter((item) => item.kind === "sms" && item.status === "active").map((item) => ({ value: item.id, label: item.name }))]} onChange={(connectionId) => updateNodeData(node.id, { provider_connection_id: connectionId || undefined })} /></label> : null}</>
        ) : null}

        {node.type === "dateInput" ? (
          <fieldset>
            <legend>Date limits</legend>
            <div className="property-grid-two">
              <label>Earliest<input type="date" value={node.data.min_date ?? ""} onChange={(event) => updateNodeData(node.id, { min_date: event.target.value })} /></label>
              <label>Latest<input type="date" value={node.data.max_date ?? ""} onChange={(event) => updateNodeData(node.id, { max_date: event.target.value })} /></label>
            </div>
          </fieldset>
        ) : null}

        {node.type === "fileUpload" ? (
          <fieldset>
            <legend>File restrictions</legend>
            <div className="provider-shell-notice">Local signed storage and malware screening work immediately. Select object storage after connecting it under Integrations.</div>
            <label>Storage<SpaghettiSelect ariaLabel="Storage" value={node.data.storage_provider ?? "local"} options={[{ value: "local", label: "Local secure storage" }, { value: "object", label: "Connected object storage" }]} onChange={(storageProvider) => updateNodeData(node.id, { storage_provider: storageProvider, provider_connection_id: storageProvider === "local" ? undefined : node.data.provider_connection_id })} /></label>
            {node.data.storage_provider === "object" ? <label>Storage connection<SpaghettiSelect ariaLabel="Storage connection" value={node.data.provider_connection_id ?? ""} options={[{ value: "", label: "Choose storage connection" }, ...connections.filter((item) => item.kind === "storage" && item.status === "active").map((item) => ({ value: item.id, label: item.name }))]} onChange={(connectionId) => updateNodeData(node.id, { provider_connection_id: connectionId || undefined })} /></label> : null}
            <label>Allowed MIME types<input value={(node.data.file_types ?? []).join(", ")} onChange={(event) => updateNodeData(node.id, { file_types: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
            <div className="property-grid-two">
              <label>Max size (MB)<input type="number" min={1} value={node.data.max_file_size_mb ?? 10} onChange={(event) => updateNodeData(node.id, { max_file_size_mb: optionalNumber(event.target.value) })} /></label>
              <label>Max files<input type="number" min={1} value={node.data.max_files ?? 1} onChange={(event) => updateNodeData(node.id, { max_files: optionalNumber(event.target.value) })} /></label>
            </div>
          </fieldset>
        ) : null}

        {node.type === "links" ? (
          <fieldset className="links-editor">
            <legend>Links</legend>
            {(node.data.links ?? []).map((link, index) => {
              const destination = linkDestinationConfig(link.link_type);
              return <div className="linked-action-field" key={index}>
                <label>
                  Type
                  <SpaghettiSelect ariaLabel={`Link ${index + 1} type`} value={link.link_type ?? "website"} options={linkTypeOptions} onChange={(linkType) => {
                    const links = (node.data.links ?? []).map((item, itemIndex) => itemIndex === index ? {
                      ...item,
                      link_type: linkType,
                      url: (item.link_type ?? "website") === linkType ? item.url : "",
                    } : item);
                    updateNodeData(node.id, { links });
                  }} />
                </label>
                <label className="linked-action-destination">
                  {destination.destinationLabel}
                  <input
                    type={destination.inputType}
                    inputMode={destination.inputMode}
                    value={link.url}
                    placeholder={destination.placeholder}
                    aria-label={`Link ${index + 1} ${destination.destinationLabel}`}
                    onChange={(event) => {
                    const links = (node.data.links ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item);
                    updateNodeData(node.id, { links });
                  }} />
                </label>
                <label>
                  Label
                  <input value={link.label} placeholder="Button label" onChange={(event) => {
                    const links = (node.data.links ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item);
                    updateNodeData(node.id, { links });
                  }} />
                </label>
                <label className="linked-action-new-tab">
                  New tab
                  <input
                    type="checkbox"
                    checked={link.new_tab !== false}
                    aria-label={`Open link ${index + 1} in a new tab`}
                    onChange={(event) => {
                      const links = (node.data.links ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, new_tab: event.target.checked } : item);
                      updateNodeData(node.id, { links });
                    }}
                  />
                </label>
                <button className="mini-icon-button linked-action-delete" type="button" title="Delete link" aria-label={`Remove link ${index + 1}`} onClick={() => updateNodeData(node.id, { links: (node.data.links ?? []).filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></button>
              </div>;
            })}
            <button className="secondary-button add-option-button" type="button" onClick={() => updateNodeData(node.id, { links: [...(node.data.links ?? []), { label: "New link", url: "", link_type: "website", new_tab: true }] })}><Plus size={14} /> Add link</button>
          </fieldset>
        ) : null}

        {node.type === "thankYou" ? (
          <fieldset>
            <legend>Call to action</legend>
            <label>Button label<input value={node.data.cta_label ?? ""} onChange={(event) => updateNodeData(node.id, { cta_label: event.target.value })} /></label>
            <label>Destination URL<input value={node.data.cta_url ?? ""} placeholder="https://example.com" onChange={(event) => updateNodeData(node.id, { cta_url: event.target.value })} /></label>
          </fieldset>
        ) : null}

        {node.type === "whatsappRedirect" ? (
          <fieldset>
            <legend>WhatsApp destination</legend>
            <label>Phone number<input value={node.data.whatsapp_phone ?? ""} placeholder="971501234567" onChange={(event) => updateNodeData(node.id, { whatsapp_phone: event.target.value })} /></label>
            <label>Message template<textarea rows={3} value={node.data.whatsapp_message ?? ""} onChange={(event) => updateNodeData(node.id, { whatsapp_message: event.target.value })} /></label>
          </fieldset>
        ) : null}

        {node.type === "payment" ? (
          <fieldset>
            <legend>Payment</legend>
            <div className="provider-shell-notice">Sandbox works locally with server-side verification. Live providers use encrypted credentials from Integrations.</div>
            <label>Provider<SpaghettiSelect ariaLabel="Payment provider" value={node.data.provider ?? "sandbox"} options={[{ value: "sandbox", label: "Sandbox" }, { value: "stripe", label: "Stripe" }, { value: "paypal", label: "PayPal" }, { value: "cash", label: "Cash" }]} onChange={(provider) => updateNodeData(node.id, { provider, provider_connection_id: ["sandbox", "cash"].includes(provider) ? undefined : node.data.provider_connection_id })} /></label>
            {!(["sandbox", "cash"].includes(node.data.provider ?? "sandbox")) ? <label>Payment connection<SpaghettiSelect ariaLabel="Payment connection" value={node.data.provider_connection_id ?? ""} options={[{ value: "", label: "Choose payment connection" }, ...connections.filter((item) => item.kind === node.data.provider && item.status === "active").map((item) => ({ value: item.id, label: item.name }))]} onChange={(connectionId) => updateNodeData(node.id, { provider_connection_id: connectionId || undefined })} /></label> : null}
            <div className="property-grid-two">
              <label>Amount<input type="number" min={0} step="0.01" value={node.data.amount ?? 0} onChange={(event) => updateNodeData(node.id, { amount: optionalNumber(event.target.value) })} /></label>
              <label>Currency<input value={node.data.currency ?? "USD"} onChange={(event) => updateNodeData(node.id, { currency: event.target.value.toUpperCase() })} /></label>
            </div>
          </fieldset>
        ) : null}

        {node.type === "appointment" ? (
          <fieldset>
            <legend>Appointment</legend>
            <div className="provider-shell-notice">The local calendar includes live availability and conflict locking. Connected calendars use the same pinned node configuration.</div>
            <label>Calendar<SpaghettiSelect ariaLabel="Appointment calendar" value={node.data.provider ?? "local"} options={[{ value: "local", label: "Local calendar" }, { value: "google_calendar", label: "Google Calendar" }, { value: "microsoft_calendar", label: "Microsoft Calendar" }]} onChange={(provider) => updateNodeData(node.id, { provider, provider_connection_id: provider === "local" ? undefined : node.data.provider_connection_id })} /></label>
            {node.data.provider !== "local" ? <label>Calendar connection<SpaghettiSelect ariaLabel="Calendar connection" value={node.data.provider_connection_id ?? ""} options={[{ value: "", label: "Choose calendar connection" }, ...connections.filter((item) => item.kind === node.data.provider && item.status === "active").map((item) => ({ value: item.id, label: item.name }))]} onChange={(connectionId) => updateNodeData(node.id, { provider_connection_id: connectionId || undefined })} /></label> : null}
            <div className="property-grid-two">
              <label>Duration (minutes)<input type="number" min={5} value={node.data.duration_minutes ?? 30} onChange={(event) => updateNodeData(node.id, { duration_minutes: optionalNumber(event.target.value) })} /></label>
              <label>Timezone<input value={node.data.timezone ?? "UTC"} onChange={(event) => updateNodeData(node.id, { timezone: event.target.value })} /></label>
            </div>
            <div className="property-grid-two"><label>Opens at<input type="number" min={0} max={23} value={node.data.opening_hour ?? 9} onChange={(event) => updateNodeData(node.id, { opening_hour: optionalNumber(event.target.value) })} /></label><label>Closes at<input type="number" min={1} max={24} value={node.data.closing_hour ?? 17} onChange={(event) => updateNodeData(node.id, { closing_hour: optionalNumber(event.target.value) })} /></label></div>
          </fieldset>
        ) : null}

        {node.type === "condition" ? (
          <>
            <label>
              Variable
              <input
                value={node.data.variable ?? ""}
                placeholder="answer_name"
                onChange={(event) => updateNodeData(node.id, { variable: event.target.value })}
              />
            </label>
            <label>
              Operator
              <SpaghettiSelect
                ariaLabel="Condition operator"
                value={node.data.operator ?? "=="}
                options={["==", "!=", ">", ">=", "<", "<=", "contains", "not contains"].map((operator) => ({ value: operator, label: operator }))}
                onChange={(operator) =>
                  updateNodeData(node.id, {
                    operator: operator as NonNullable<typeof node.data.operator>,
                  })
                }
              />
            </label>
            <label>
              Compare with
              <input
                value={String(node.data.value ?? "")}
                onChange={(event) => updateNodeData(node.id, { value: event.target.value })}
              />
            </label>
          </>
        ) : null}

        {node.type === "setVariable" ? (
          <>
            <label>
              Variable
              <input
                value={node.data.variable ?? ""}
                onChange={(event) => updateNodeData(node.id, { variable: event.target.value })}
              />
            </label>
            <label>
              Value
              <input
                value={String(node.data.value ?? "")}
                onChange={(event) => updateNodeData(node.id, { value: event.target.value })}
              />
            </label>
          </>
        ) : null}

        {node.type === "subflow" ? (
          <>
            <label>
              Component
              <SpaghettiSelect
                ariaLabel="Reusable component"
                value={node.data.subflow_id ?? ""}
                options={[{ value: "", label: "Select a component…" }, ...subflows.map((subflow) => ({ value: subflow.id, label: subflow.name }))]}
                onChange={(subflowId) => {
                  const subflow = subflows.find((item) => item.id === subflowId);
                  if (!subflow) {
                    updateNodeData(node.id, { subflow_id: undefined, subflow_name: undefined });
                    applyVersion(undefined);
                    return;
                  }
                  setDependencyError("");
                  updateNodeData(node.id, { subflow_id: subflow.id, subflow_name: subflow.name, label: subflow.name });
                  void listSubflowVersions(subflow.id).then((items) => {
                    setVersions(items);
                    applyVersion(items[0], subflow);
                  });
                }}
              />
            </label>
            <label>
              Pinned version
              <SpaghettiSelect
                ariaLabel="Pinned component version"
                disabled={!node.data.subflow_id}
                value={node.data.subflow_version_id ?? ""}
                options={[{ value: "", label: "Select a published version…" }, ...versions.map((version) => ({ value: version.id, label: `Version ${version.version_number}` }))]}
                onChange={(versionId) => applyVersion(versions.find((item) => item.id === versionId))}
              />
            </label>
            {node.data.subflow_id ? (
              <Link className="secondary-button component-definition-link" href={`/subflows/${node.data.subflow_id}/builder`}>
                Open definition
              </Link>
            ) : null}
            {dependencyError ? <div className="form-error">{dependencyError}</div> : null}
            {Object.entries(node.data.input_schema ?? {}).length ? (
              <fieldset>
                <legend>Input mapping</legend>
                {Object.entries(node.data.input_schema ?? {}).map(([name, definition]) => (
                  <label key={name}>
                    {name} <small>{definition.type}{definition.required ? " · required" : ""}</small>
                    <input
                      value={String(node.data.inputs?.[name] ?? "")}
                      placeholder={`{{${name}}}`}
                      onChange={(event) => updateNodeData(node.id, {
                        inputs: { ...(node.data.inputs ?? {}), [name]: event.target.value },
                      })}
                    />
                  </label>
                ))}
              </fieldset>
            ) : null}
            {Object.entries(node.data.output_schema ?? {}).length ? (
              <fieldset>
                <legend>Output mapping</legend>
                {Object.entries(node.data.output_schema ?? {}).map(([name, definition]) => (
                  <label key={name}>
                    {name} <small>{definition.type}</small>
                    <input
                      value={node.data.outputs?.[name] ?? ""}
                      placeholder="parent.variable"
                      onChange={(event) => updateNodeData(node.id, {
                        outputs: { ...(node.data.outputs ?? {}), [name]: event.target.value },
                      })}
                    />
                  </label>
                ))}
              </fieldset>
            ) : null}
          </>
        ) : null}

        {node.type === "ruleSet" || node.type === "decisionTable" ? (
          <>
            <label>
              {node.type === "ruleSet" ? "Rule set" : "Decision table"}
              <SpaghettiSelect
                ariaLabel={node.type === "ruleSet" ? "Rule set" : "Decision table"}
                value={node.data.logic_asset_id ?? ""}
                options={[{ value: "", label: "Select reusable logic…" }, ...logicAssets.map((asset) => ({ value: asset.id, label: asset.name }))]}
                onChange={(assetId) => {
                  const asset = logicAssets.find((item) => item.id === assetId);
                  if (!asset) {
                    updateNodeData(node.id, { logic_asset_id: undefined, logic_name: undefined });
                    applyLogicVersion(undefined);
                    return;
                  }
                  setDependencyError("");
                  updateNodeData(node.id, { logic_asset_id: asset.id, logic_name: asset.name, logic_kind: asset.kind, label: asset.name });
                  void listLogicVersions(asset.id).then((items) => {
                    setLogicVersions(items);
                    applyLogicVersion(items[0], asset);
                  });
                }}
              />
            </label>
            <label>
              Pinned version
              <SpaghettiSelect
                ariaLabel="Pinned logic version"
                disabled={!node.data.logic_asset_id}
                value={node.data.logic_version_id ?? ""}
                options={[{ value: "", label: "Select a published version…" }, ...logicVersions.map((version) => ({ value: version.id, label: `Version ${version.version_number}` }))]}
                onChange={(versionId) => applyLogicVersion(logicVersions.find((item) => item.id === versionId))}
              />
            </label>
            {node.data.logic_asset_id ? <Link className="secondary-button component-definition-link" href={`/logic/${node.data.logic_asset_id}`}>Open definition</Link> : null}
            {dependencyError ? <div className="form-error">{dependencyError}</div> : null}
            {Object.entries(node.data.input_schema ?? {}).length ? (
              <fieldset>
                <legend>Input mapping</legend>
                {Object.entries(node.data.input_schema ?? {}).map(([name, definition]) => (
                  <label key={name}>{name} <small>{definition.type}{definition.required ? " · required" : ""}</small><input value={String(node.data.inputs?.[name] ?? "")} placeholder={`{{${name}}}`} onChange={(event) => updateNodeData(node.id, { inputs: { ...(node.data.inputs ?? {}), [name]: event.target.value } })} /></label>
                ))}
              </fieldset>
            ) : null}
            {Object.entries(node.data.output_schema ?? {}).length ? (
              <fieldset>
                <legend>Output mapping</legend>
                {Object.entries(node.data.output_schema ?? {}).map(([name, definition]) => (
                  <label key={name}>{name} <small>{definition.type}</small><input value={node.data.outputs?.[name] ?? ""} placeholder="parent.variable" onChange={(event) => updateNodeData(node.id, { outputs: { ...(node.data.outputs ?? {}), [name]: event.target.value } })} /></label>
                ))}
              </fieldset>
            ) : null}
          </>
        ) : null}

        {!terminalTypes.has(node.type) ? (
          <fieldset className="jump-routing">
            <legend>Jump to node</legend>
            <p>Selecting a destination creates or replaces this route.</p>
            {jumpRoutes.map((route) => {
              const currentEdge = edges.find((edge) =>
                edge.source === node.id && (
                  !isBranchingJump || (edge.sourceHandle ?? null) === route.handle
                ),
              );
              return (
                <label key={route.handle ?? "default"}>
                  <span>{route.label}</span>
                  <SpaghettiSelect
                    ariaLabel={`${route.label} jump destination`}
                    value={currentEdge?.target ?? ""}
                    options={[
                      { value: "", label: "Not connected" },
                      ...jumpTargets.map((target) => ({
                        value: target.id,
                        label: `#${target.data.node_number} — ${richTextToPlainText(target.data.label)}`,
                      })),
                    ]}
                    onChange={(targetId) => setJumpTarget(
                      node.id,
                      targetId || null,
                      route.handle,
                      isBranchingJump ? route.label : undefined,
                    )}
                  />
                </label>
              );
            })}
          </fieldset>
        ) : (
          <div className="jump-terminal-note">Node #{node.data.node_number} ends this path.</div>
        )}

        {node.type !== "start" ? (
          <button
            className="danger-button"
            onClick={() => {
              onNodesChange([{ id: node.id, type: "remove" }]);
              selectNode(null);
            }}
            type="button"
          >
            <Trash2 size={16} /> Delete node
          </button>
        ) : null}
      </div>
      </section>
    </div>
  );
}
