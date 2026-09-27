"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AtSign,
  Blocks,
  CalendarDays,
  ChevronRight,
  CircleDot,
  CornerUpLeft,
  CreditCard,
  FileUp,
  Flag,
  Gauge,
  GitBranch,
  Hash,
  Layers3,
  Link2,
  ListChecks,
  ListTree,
  MessageCircle,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TextCursorInput,
  Variable,
  X,
} from "lucide-react";
import type { BuilderNodeType } from "@/types/flow";

type PaletteGroup = "Input" | "Choice" | "Content" | "Rating" | "Actions" | "Advanced";
type PaletteItem = {
  type: BuilderNodeType;
  group: PaletteGroup;
  title: string;
  description: string;
  icon: typeof Play;
};

const items: PaletteItem[] = [
  { group: "Input", type: "textInput", title: "Text Question", description: "Capture a free-text answer", icon: TextCursorInput },
  { group: "Input", type: "emailInput", title: "Email", description: "Capture and validate an email", icon: AtSign },
  { group: "Input", type: "phoneInput", title: "Phone Number", description: "Capture and validate a phone number", icon: Phone },
  { group: "Input", type: "numberInput", title: "Number", description: "Capture a numeric answer", icon: Hash },
  { group: "Input", type: "dateInput", title: "Date", description: "Capture a date with optional limits", icon: CalendarDays },
  { group: "Input", type: "rangeInput", title: "Range", description: "Let the visitor choose a slider value", icon: SlidersHorizontal },
  { group: "Choice", type: "singleChoice", title: "Yes / No", description: "Branch through selectable options", icon: ListChecks },
  { group: "Choice", type: "multipleChoice", title: "Multi Select", description: "Allow several selected answers", icon: ListChecks },
  { group: "Choice", type: "searchableList", title: "Searchable List", description: "Choose from a type-ahead list", icon: Search },
  { group: "Content", type: "message", title: "Message", description: "Show formatted text or media", icon: MessageSquareText },
  { group: "Rating", type: "ratingInput", title: "Rating", description: "Capture a star or numeric rating", icon: Star },
  { group: "Rating", type: "opinionScale", title: "Opinion Scale", description: "Capture numeric sentiment", icon: Gauge },
  { group: "Actions", type: "links", title: "Links", description: "Show buttons and external resources", icon: Link2 },
  { group: "Actions", type: "thankYou", title: "Thank You", description: "Finish with a call to action", icon: Flag },
  { group: "Actions", type: "whatsappRedirect", title: "WhatsApp", description: "Finish by opening WhatsApp", icon: MessageCircle },
  { group: "Advanced", type: "appointment", title: "Appointment", description: "Offer bookable appointment times", icon: CalendarDays },
  { group: "Advanced", type: "fileUpload", title: "File Upload", description: "Collect one or more files", icon: FileUp },
  { group: "Advanced", type: "payment", title: "Payment", description: "Collect a provider-backed payment", icon: CreditCard },
  { group: "Advanced", type: "ruleSet", title: "Rule Set", description: "Run pinned business rules", icon: ListTree },
  { group: "Advanced", type: "decisionTable", title: "Decision Table", description: "Run a FIRST or UNIQUE policy", icon: GitBranch },
  { group: "Advanced", type: "condition", title: "Condition", description: "Create true and false paths", icon: GitBranch },
  { group: "Advanced", type: "setVariable", title: "Set Variable", description: "Store a value in the flow", icon: Variable },
  { group: "Advanced", type: "subflow", title: "Subflow", description: "Call a pinned reusable component", icon: Blocks },
  { group: "Advanced", type: "start", title: "Start", description: "Add an entry point", icon: Play },
  { group: "Advanced", type: "end", title: "End", description: "Finish a conversation path", icon: Flag },
  { group: "Advanced", type: "return", title: "Return", description: "Return to the parent component", icon: CornerUpLeft },
];

const groups: Array<{ id: PaletteGroup; icon: typeof Play }> = [
  { id: "Input", icon: TextCursorInput },
  { id: "Choice", icon: CircleDot },
  { id: "Content", icon: MessageSquareText },
  { id: "Rating", icon: Star },
  { id: "Actions", icon: Link2 },
  { id: "Advanced", icon: Layers3 },
];

const favoriteStorageKey = "spaghetti:palette-favorites";
const recentStorageKey = "spaghetti:palette-recent";

export function NodePalette({
  onAdd,
  mode = "bot",
}: {
  onAdd: (type: BuilderNodeType) => void;
  mode?: "bot" | "subflow";
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeGroup, setActiveGroup] = useState<PaletteGroup | "Quick access" | null>("Quick access");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<BuilderNodeType[]>(["message", "singleChoice", "textInput"]);
  const [recent, setRecent] = useState<BuilderNodeType[]>([]);

  useEffect(() => {
    try {
      const savedFavorites = window.localStorage.getItem(favoriteStorageKey);
      const savedRecent = window.localStorage.getItem(recentStorageKey);
      if (savedFavorites) setFavorites(JSON.parse(savedFavorites) as BuilderNodeType[]);
      if (savedRecent) setRecent(JSON.parse(savedRecent) as BuilderNodeType[]);
    } catch {
      // Keep the defaults when browser storage is unavailable or malformed.
    }
  }, []);

  const availableItems = useMemo(
    () => items.filter((item) => (mode === "bot" ? item.type !== "return" : item.type !== "end")),
    [mode],
  );
  const itemByType = useMemo(() => new Map(availableItems.map((item) => [item.type, item])), [availableItems]);
  const quickItems = useMemo(() => {
    const orderedTypes = [...favorites, ...recent].filter((type, index, values) => values.indexOf(type) === index);
    return orderedTypes.map((type) => itemByType.get(type)).filter((item): item is PaletteItem => Boolean(item)).slice(0, 6);
  }, [favorites, itemByType, recent]);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return availableItems.filter((item) => `${item.title} ${item.description} ${item.group}`.toLowerCase().includes(normalized));
  }, [availableItems, query]);

  const recordUse = (type: BuilderNodeType) => {
    const next = [type, ...recent.filter((item) => item !== type)].slice(0, 5);
    setRecent(next);
    window.localStorage.setItem(recentStorageKey, JSON.stringify(next));
  };

  const add = (type: BuilderNodeType) => {
    recordUse(type);
    onAdd(type);
  };

  const startDrag = (event: React.DragEvent<HTMLButtonElement>, type: BuilderNodeType) => {
    recordUse(type);
    event.dataTransfer.setData("application/reactflow", type);
    event.dataTransfer.effectAllowed = "move";
  };

  const toggleFavorite = (type: BuilderNodeType) => {
    const next = favorites.includes(type) ? favorites.filter((item) => item !== type) : [...favorites, type];
    setFavorites(next);
    window.localStorage.setItem(favoriteStorageKey, JSON.stringify(next));
  };

  const openGroup = (group: PaletteGroup) => {
    setCollapsed(false);
    setActiveGroup(group);
    setQuery("");
  };

  const renderItem = (item: PaletteItem) => {
    const Icon = item.icon;
    const isFavorite = favorites.includes(item.type);
    return (
      <div className="palette-library-item" key={item.type}>
        <button
          className="palette-library-add"
          draggable
          title={`${item.description}. Click to add at the center of your current view, or drag to place.`}
          onClick={() => add(item.type)}
          onDragStart={(event) => startDrag(event, item.type)}
          type="button"
        >
          <span className={`palette-library-icon palette-icon-${item.type}`}><Icon aria-hidden="true" size={17} /></span>
          <span><strong>{item.title}</strong><small>{item.description}</small></span>
        </button>
        <button
          aria-label={`${isFavorite ? "Remove" : "Add"} ${item.title} ${isFavorite ? "from" : "to"} favorites`}
          className={`palette-favorite${isFavorite ? " is-favorite" : ""}`}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          type="button"
          onClick={() => toggleFavorite(item.type)}
        >
          <Star aria-hidden="true" size={14} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>
    );
  };

  if (collapsed) {
    return (
      <aside className="builder-sidebar palette-library is-collapsed" aria-label="Node components">
        <button className="palette-rail-toggle" type="button" aria-label="Expand components" title="Expand components" onClick={() => setCollapsed(false)}><PanelLeftOpen size={18} /></button>
        <nav className="palette-rail-groups" aria-label="Component categories">
          <button type="button" aria-label="Quick access" title="Quick access" onClick={() => { setCollapsed(false); setActiveGroup("Quick access"); }}><Sparkles size={18} /></button>
          {groups.map(({ id, icon: Icon }) => <button key={id} type="button" aria-label={id} title={id} onClick={() => openGroup(id)}><Icon size={18} /></button>)}
        </nav>
      </aside>
    );
  }

  return (
    <aside className="builder-sidebar palette-library" aria-label="Node components">
      <header className="palette-library-header">
        <div><strong>Components</strong><small>Click or drag to add</small></div>
        <button type="button" aria-label="Collapse components" title="Collapse components" onClick={() => setCollapsed(true)}><PanelLeftClose size={18} /></button>
      </header>

      <label className="palette-library-search">
        <Search aria-hidden="true" size={15} />
        <input aria-label="Search components" placeholder="Search components…" value={query} onChange={(event) => setQuery(event.target.value)} />
        {query ? <button type="button" aria-label="Clear component search" onClick={() => setQuery("")}><X size={14} /></button> : null}
      </label>

      {query ? (
        <section className="palette-library-results palette-library-search-results" aria-label="Component search results">
          <div className="palette-library-results-heading"><span>Search results</span><small>{filteredItems.length}</small></div>
          {filteredItems.length ? filteredItems.map(renderItem) : <div className="palette-library-empty"><Search size={18} /><span>No matching components</span></div>}
        </section>
      ) : (
        <nav className="palette-library-accordion" aria-label="Component categories">
          <section className={`palette-library-section${activeGroup === "Quick access" ? " is-open" : ""}`}>
            <button
              className="palette-library-section-trigger"
              type="button"
              aria-expanded={activeGroup === "Quick access"}
              onClick={() => setActiveGroup((current) => current === "Quick access" ? null : "Quick access")}
            >
              <span><Sparkles size={16} /> Quick access</span>
              <span className="palette-group-meta">{quickItems.length}<ChevronRight size={14} /></span>
            </button>
            {activeGroup === "Quick access" ? (
              <div className="palette-library-section-items" aria-label="Quick access components">
                {quickItems.length ? quickItems.map(renderItem) : <div className="palette-library-empty"><Sparkles size={18} /><span>Favorite a component to keep it here</span></div>}
              </div>
            ) : null}
          </section>

          {groups.map(({ id, icon: Icon }) => {
            const groupItems = availableItems.filter((item) => item.group === id);
            const isOpen = activeGroup === id;
            return (
              <section className={`palette-library-section${isOpen ? " is-open" : ""}`} key={id}>
                <button
                  className="palette-library-section-trigger"
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setActiveGroup((current) => current === id ? null : id)}
                >
                  <span><Icon size={16} /> {id}</span>
                  <span className="palette-group-meta">{groupItems.length}<ChevronRight size={14} /></span>
                </button>
                {isOpen ? (
                  <div className="palette-library-section-items" aria-label={`${id} components`}>
                    {groupItems.map(renderItem)}
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
