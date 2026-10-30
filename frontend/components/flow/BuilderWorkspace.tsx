"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import {
  ChevronRight,
  Home,
  CheckCircle2,
  Eye,
  Inbox,
  FlaskConical,
  Rocket,
  PlugZap,
  UsersRound,
  Languages,
  LayoutDashboard,
  LayoutList,
  List,
  Network,
  Workflow,
  ListTree,
  MoreHorizontal,
  Palette,
  Save,
  Search,
  Send,
  Share2,
  Settings2,
} from "lucide-react";
import { PropertiesPanel } from "@/components/properties/PropertiesPanel";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";
import { NodePalette } from "@/components/sidebar/NodePalette";
import { loadFlow, saveFlow } from "@/services/flows";
import { getBot, publishBot, validateBot } from "@/services/bots";
import { useFlowStore } from "@/stores/flow-store";
import type { BotRecord, ValidationIssue } from "@/types/api";
import type { BuilderNodeType, FlowDocument } from "@/types/flow";
import { FlowCanvas } from "./FlowCanvas";
import { DesignWorkspace } from "./DesignWorkspace";
import { ShareWorkspace } from "./ShareWorkspace";
import { SettingsWorkspace } from "./SettingsWorkspace";

type SaveState = "idle" | "loading" | "saving" | "saved" | "local" | "error";

const QUIET_MESSAGES = new Set(["Loading draft…", "Draft loaded from PostgreSQL", "Saving draft…", "Saved to PostgreSQL", "Backend unavailable — saved in this browser", "Backend unavailable — browser draft loaded", "Backend unavailable — demo graph ready"]);

const morePages = [
  { segment: "responses", label: "Responses", description: "Collected answers and conversations", icon: Inbox },
  { segment: "quality", label: "QA", description: "Test scenarios and analytics", icon: FlaskConical },
  { segment: "deployments", label: "Deploy", description: "Widget, link, embed and targeting", icon: Rocket },
  { segment: "integrations", label: "Integrate", description: "Providers, webhooks and delivery", icon: PlugZap },
  { segment: "team", label: "Team", description: "Collaborators and audit log", icon: UsersRound },
  { segment: "localization", label: "Locales", description: "Translations and RTL", icon: Languages },
] as const;

function localStorageKey(botId: string) {
  return `visual-chatbot-builder:${botId}:draft`;
}

function QuestionsWorkspace() {
  const addNode = useFlowStore((state) => state.addNode);
  const nodes = useFlowStore((state) => state.nodes);
  const canvasRef = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const handleQuickAdd = useCallback((type: BuilderNodeType) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bounds = canvas.getBoundingClientRect();
    const viewportTopLeft = screenToFlowPosition({
      x: bounds.left,
      y: bounds.top,
    });
    const viewportBottomRight = screenToFlowPosition({
      x: bounds.right,
      y: bounds.bottom,
    });
    const viewportCenter = screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });

    // Click-to-add should always land inside the view the user is currently
    // working in. Search that view from its center outwards and choose the
    // first position that does not overlap an existing node.
    const newNodeWidth = 280;
    const newNodeHeight = 150;
    const nodeGap = 34;
    const viewportMargin = 28;
    const minX = viewportTopLeft.x + viewportMargin;
    const minY = viewportTopLeft.y + viewportMargin;
    const maxX = Math.max(minX, viewportBottomRight.x - newNodeWidth - viewportMargin);
    const maxY = Math.max(minY, viewportBottomRight.y - newNodeHeight - viewportMargin);
    const clamp = (value: number, minimum: number, maximum: number) =>
      Math.min(maximum, Math.max(minimum, value));
    const centerPosition = {
      x: clamp(viewportCenter.x - newNodeWidth / 2, minX, maxX),
      y: clamp(viewportCenter.y - newNodeHeight / 2, minY, maxY),
    };

    const candidates = [centerPosition];
    const horizontalStep = newNodeWidth + nodeGap;
    const verticalStep = newNodeHeight + nodeGap;
    for (let y = minY; y <= maxY + 1; y += verticalStep) {
      for (let x = minX; x <= maxX + 1; x += horizontalStep) {
        candidates.push({ x, y });
      }
    }
    candidates.sort((left, right) => {
      const leftDistance = Math.hypot(left.x - centerPosition.x, left.y - centerPosition.y);
      const rightDistance = Math.hypot(right.x - centerPosition.x, right.y - centerPosition.y);
      return leftDistance - rightDistance;
    });

    const overlapArea = (candidate: { x: number; y: number }, node: (typeof nodes)[number]) => {
      const existingWidth = node.measured?.width ?? node.width ?? 280;
      const existingHeight = node.measured?.height ?? node.height ?? 150;
      const overlapWidth = Math.max(
        0,
        Math.min(candidate.x + newNodeWidth, node.position.x + existingWidth + nodeGap)
          - Math.max(candidate.x, node.position.x - nodeGap),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(candidate.y + newNodeHeight, node.position.y + existingHeight + nodeGap)
          - Math.max(candidate.y, node.position.y - nodeGap),
      );
      return overlapWidth * overlapHeight;
    };

    const clearPosition = candidates.find((candidate) =>
      nodes.every((node) => overlapArea(candidate, node) === 0),
    );
    const leastCrowdedPosition = clearPosition ?? candidates.reduce((best, candidate) => {
      const candidateOverlap = nodes.reduce((total, node) => total + overlapArea(candidate, node), 0);
      const bestOverlap = nodes.reduce((total, node) => total + overlapArea(best, node), 0);
      return candidateOverlap < bestOverlap ? candidate : best;
    }, centerPosition);

    addNode(type, leastCrowdedPosition);
  }, [addNode, nodes, screenToFlowPosition]);

  return (
    <>
      <NodePalette onAdd={handleQuickAdd} />
      <FlowCanvas canvasRef={canvasRef} />
      <PropertiesPanel />
    </>
  );
}

export function BuilderWorkspace({ botId }: { botId: string }) {
  const router = useRouter();
  const getDocument = useFlowStore((state) => state.getDocument);
  const formatLayout = useFlowStore((state) => state.formatLayout);
  const viewMode = useFlowStore((state) => state.viewMode);
  const setViewMode = useFlowStore((state) => state.setViewMode);
  const layoutMode = useFlowStore((state) => state.layoutMode);
  const setLayoutMode = useFlowStore((state) => state.setLayoutMode);
  const isDirty = useFlowStore((state) => state.isDirty);
  const appearance = useFlowStore((state) => state.appearance);
  const markSaved = useFlowStore((state) => state.markSaved);
  const searchQuery = useFlowStore((state) => state.searchQuery);
  const setGraph = useFlowStore((state) => state.setGraph);
  const selectNode = useFlowStore((state) => state.selectNode);
  const setSearchQuery = useFlowStore((state) => state.setSearchQuery);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [message, setMessage] = useState("Loading draft…");
  const [bot, setBot] = useState<BotRecord | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [activeTab, setActiveTab] = useState<"questions" | "design" | "share" | "settings">("questions");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close the More menu on outside click or Escape. Capture phase, because React Flow stops pointer events bubbling from the canvas.
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  const loadDraft = useCallback(async () => {
    setSaveState("loading");
    setMessage("Loading draft…");

    const local = window.localStorage.getItem(localStorageKey(botId));
    if (local) {
      try {
        setGraph(JSON.parse(local) as FlowDocument);
      } catch {
        window.localStorage.removeItem(localStorageKey(botId));
      }
    }

    try {
      const [document, bot] = await Promise.all([loadFlow(botId), getBot(botId)]);
      setGraph(document);
      setBot(bot);
      setSaveState("saved");
      setMessage("Draft loaded from PostgreSQL");
    } catch (caught) {
      const status = caught && typeof caught === "object" && "status" in caught ? caught.status : undefined;
      if (status === 401) {
        router.replace("/login");
        return;
      }
      if (status === 403 || status === 404) {
        // The bot exists under another account or not at all; never show the demo graph as if it were this bot.
        router.replace("/dashboard?notice=bot-unavailable");
        return;
      }
      setSaveState(local ? "local" : "error");
      setMessage(local ? "Backend unavailable — browser draft loaded" : "Backend unavailable — demo graph ready");
    }
  }, [botId, router, setGraph]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  // Result messages (validation, publish, arrange) flash in the status pill for a few seconds.
  useEffect(() => {
    if (!message || QUIET_MESSAGES.has(message)) {
      setFlash(null);
      return;
    }
    setFlash(message);
    const timer = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const handleSave = async (): Promise<boolean> => {
    const document = getDocument();
    setSaveState("saving");
    setMessage("Saving draft…");

    try {
      await saveFlow(botId, document);
      window.localStorage.removeItem(localStorageKey(botId));
      markSaved();
      setSaveState("saved");
      setMessage("Saved to PostgreSQL");
      return true;
    } catch {
      window.localStorage.setItem(localStorageKey(botId), JSON.stringify(document));
      markSaved();
      setSaveState("local");
      setMessage("Backend unavailable — saved in this browser");
      return false;
    }
  };

  const handleValidate = async () => {
    if (isDirty && !(await handleSave())) return;
    try {
      const report = await validateBot(botId);
      setValidationIssues(report.issues);
      setMessage(report.valid ? "All nodes are connected" : `${report.issues.length} unconnected ${report.issues.length === 1 ? "node" : "nodes"}`);
      setSaveState(report.valid ? "saved" : "error");
      if (!report.valid && report.issues[0]?.node_ids[0]) selectNode(report.issues[0].node_ids[0]);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Validation failed");
      setSaveState("error");
    }
  };

  const handlePreview = async () => {
    if (isDirty && !(await handleSave())) return;
    try {
      const report = await validateBot(botId);
      const errors = report.issues.filter((issue) => issue.severity === "error");
      setValidationIssues(report.issues);
      const blocking = errors.filter((issue) => ["start_count", "unsupported_node_type", "missing_edge_node"].includes(issue.code));
      if (blocking.length) {
        setMessage(`Preview blocked — fix ${blocking.length} structural ${blocking.length === 1 ? "error" : "errors"}`);
        setSaveState("error");
        if (blocking[0].node_ids[0]) selectNode(blocking[0].node_ids[0]);
        return;
      }
      router.push(`/bots/${botId}/preview`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Preview validation failed");
      setSaveState("error");
    }
  };

  const handlePublish = async () => {
    if (isDirty && !(await handleSave())) return;
    try {
      const result = await publishBot(botId);
      setMessage(`Published version ${result.version.version_number}`);
      setSaveState("saved");
      window.open(result.public_url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Publish failed");
      setSaveState("error");
    }
  };

  // The pill answers one question: are the latest changes saved?
  const publishState: { text: string; tone: "warn" | "ok" | "neutral" | "error" | "info" } =
    saveState === "loading" ? { text: "Loading…", tone: "neutral" }
    : saveState === "saving" ? { text: "Saving…", tone: "info" }
    : saveState === "error" ? { text: message, tone: "error" }
    : saveState === "local" ? { text: "Saved in this browser only", tone: "warn" }
    : flash ? { text: flash, tone: "info" }
    : isDirty ? { text: "Unsaved changes", tone: "warn" }
    : { text: "Saved", tone: "ok" };

  return (
    <main
      className={`builder-page${activeTab === "design" ? " is-design-mode" : activeTab === "share" ? " is-share-mode" : activeTab === "settings" ? " is-settings-mode" : ""}`}
      style={{
        "--builder-canvas-color": "#FFFFFF",
        "--builder-node-color": appearance.surface_color,
        "--builder-text-color": appearance.text_color,
        "--builder-accent-color": appearance.primary_color,
      } as CSSProperties}
    >
      <header className="builder-topbar">
        <nav className="builder-crumbs" aria-label="Breadcrumb">
          <Link href="/dashboard" className="crumb-home" aria-label="Dashboard" title="Dashboard">
            <Home size={16} />
          </Link>
          <ChevronRight className="crumb-sep" size={14} aria-hidden />
          <span className="crumb-bot" title={bot?.name ?? ""}>{bot?.name ?? "Loading…"}</span>
          <ChevronRight className="crumb-sep" size={14} aria-hidden />
          <div className="crumb-switch" role="group" aria-label="Bot section">
            <button className="is-active" type="button" aria-current="page">Edit</button>
            <Link href={`/bots/${botId}/responses`}>Results</Link>
          </div>
          <span className={`publish-state publish-state-${publishState.tone}`} role="status" title={publishState.text}>
            <i aria-hidden />
            {publishState.text}
          </span>
        </nav>

        {activeTab === "questions" ? (
          <label className="builder-search">
            <Search size={16} />
            <input
              aria-label="Search nodes"
              placeholder="Search nodes…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
        ) : null}

        <div className="builder-actions">
          {activeTab === "questions" ? (
            <>
              <div className="layout-switch" role="group" aria-label="Canvas layout">
                <button type="button" className={layoutMode === "flow" ? "is-active" : ""} aria-pressed={layoutMode === "flow"} title="Flow: nodes stay where you place them" onClick={() => setLayoutMode("flow")}><Workflow size={14} /> Flow</button>
                <button type="button" className={layoutMode === "tree" ? "is-active" : ""} aria-pressed={layoutMode === "tree"} title="Tree: a top-down hierarchy from Start; double-click a node to fold its branch" onClick={() => setLayoutMode("tree")}><Network size={14} /> Tree</button>
              </div>
              <button
                className={`secondary-button compact-action view-mode-toggle${viewMode === "compact" ? " is-on" : ""}`}
                aria-pressed={viewMode === "compact"}
                onClick={() => setViewMode(viewMode === "compact" ? "detailed" : "compact")}
                title={viewMode === "compact" ? "Compact view: short cards, selection focus. Click for the detailed view." : "Detailed view: full node content. Click for the compact view."}
                type="button"
              >
                {viewMode === "compact" ? <List size={15} /> : <LayoutList size={15} />} {viewMode === "compact" ? "Compact" : "Detailed"}
              </button>
              <button
                className="secondary-button compact-action"
                onClick={() => {
                  formatLayout();
                  setMessage("Nodes arranged for easier reading — save to keep the layout");
                }}
                title="Automatically arrange nodes into readable columns"
                type="button"
              >
                <LayoutDashboard size={15} /> Auto arrange
              </button>
              <button className="secondary-button compact-action" onClick={() => void handleValidate()} type="button">
                <CheckCircle2 size={15} /> Validate
              </button>
            </>
          ) : null}
          <button className="secondary-button compact-action" onClick={() => void handlePreview()} type="button">
            <Eye size={15} /> Preview
          </button>
          {activeTab === "questions" ? (
            <>
              <div className="builder-more" ref={moreRef}>
                <button
                  className={`secondary-button compact-action${moreOpen ? " is-open" : ""}`}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((open) => !open)}
                >
                  <MoreHorizontal size={15} /> More
                </button>
                {moreOpen ? (
                  <div className="builder-more-menu" role="menu" aria-label="More bot pages">
                    {morePages.map((page) => (
                      <Link key={page.segment} role="menuitem" href={`/bots/${botId}/${page.segment}`} onClick={() => setMoreOpen(false)}>
                        <page.icon size={16} />
                        <span>
                          <strong>{page.label}</strong>
                          <small>{page.description}</small>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <button className="secondary-button compact-action" onClick={() => void handlePublish()} type="button">
                <Send size={15} /> Publish
              </button>
            </>
          ) : null}
          <button className="primary-button save-draft-button" onClick={() => void handleSave()} disabled={saveState === "saving"} type="button">
            <Save size={15} /> {saveState === "saving" ? "Saving…" : "Save draft"}
          </button>
        </div>
      </header>

      <nav className="builder-tabs" aria-label="Builder sections">
        <button
          className={activeTab === "questions" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("questions")}
        >
          <ListTree size={16} /> Questions
        </button>
        <button
          className={activeTab === "design" ? "is-active" : ""}
          type="button"
          onClick={() => {
            selectNode(null);
            setActiveTab("design");
          }}
        >
          <Palette size={16} /> Design
        </button>
        <button
          className={activeTab === "share" ? "is-active" : ""}
          type="button"
          onClick={() => {
            selectNode(null);
            setActiveTab("share");
          }}
        >
          <Share2 size={16} /> Share
        </button>
        <button
          className={activeTab === "settings" ? "is-active" : ""}
          type="button"
          onClick={() => {
            selectNode(null);
            setActiveTab("settings");
          }}
        >
          <Settings2 size={16} /> Settings
        </button>
      </nav>

      {activeTab === "questions" && validationIssues.length ? (
        <section className="builder-validation has-errors" aria-live="polite">
          <div>
            <strong>Nodes need connections</strong>
            <span>{validationIssues.length} unconnected {validationIssues.length === 1 ? "node" : "nodes"}</span>
          </div>
          <ul>
            {validationIssues.slice(0, 6).map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                <button type="button" onClick={() => issue.node_ids[0] && selectNode(issue.node_ids[0])} disabled={!issue.node_ids[0]}>
                  <span>Connect</span> {issue.message}
                </button>
              </li>
            ))}
          </ul>
          <button className="icon-button" type="button" aria-label="Dismiss validation results" onClick={() => setValidationIssues([])}>×</button>
        </section>
      ) : null}

      {activeTab === "questions" ? (
        <div className="builder-layout">
          <ReactFlowProvider>
            <QuestionsWorkspace />
          </ReactFlowProvider>
        </div>
      ) : activeTab === "design" ? (
        <DesignWorkspace />
      ) : activeTab === "share" ? (
        <ShareWorkspace botId={botId} />
      ) : (
        <SettingsWorkspace botId={botId} />
      )}
    </main>
  );
}
