import {
  AtSign,
  Blocks,
  CalendarDays,
  ChevronDown,
  CornerUpLeft,
  CreditCard,
  Crown,
  FileUp,
  Flag,
  Gauge,
  GitBranch,
  Hash,
  Link2,
  ListChecks,
  ListTree,
  MessageSquareText,
  MessageCircle,
  Phone,
  Play,
  Search,
  SlidersHorizontal,
  Star,
  TextCursorInput,
  Variable,
} from "lucide-react";
import type { BuilderNodeType } from "@/types/flow";

const items: Array<{
  type: BuilderNodeType;
  group: string;
  title: string;
  description: string;
  icon: typeof Play;
}> = [
  { group: "Input", type: "textInput", title: "Text Question", description: "Capture text", icon: TextCursorInput },
  { group: "Input", type: "emailInput", title: "Email", description: "Validate email", icon: AtSign },
  { group: "Input", type: "phoneInput", title: "Phone Number", description: "Validate phone", icon: Phone },
  { group: "Input", type: "numberInput", title: "Number", description: "Capture a number", icon: Hash },
  { group: "Input", type: "dateInput", title: "Date", description: "Date with limits", icon: CalendarDays },
  { group: "Input", type: "rangeInput", title: "Range", description: "Slider value", icon: SlidersHorizontal },
  { group: "Choice", type: "singleChoice", title: "Yes / No", description: "Branch options", icon: ListChecks },
  { group: "Choice", type: "multipleChoice", title: "Multi Select", description: "Select many", icon: ListChecks },
  { group: "Choice", type: "searchableList", title: "List", description: "Type-ahead choice", icon: Search },
  { group: "Rating", type: "ratingInput", title: "Rating", description: "Stars or scale", icon: Star },
  { group: "Rating", type: "opinionScale", title: "Opinion Scale", description: "Numeric sentiment", icon: Gauge },
  { group: "Other", type: "message", title: "Message", description: "Show text", icon: MessageSquareText },
  { group: "Other", type: "links", title: "Links", description: "Buttons and resources", icon: Link2 },
  { group: "Other", type: "thankYou", title: "Thank You", description: "Finish with an action", icon: Flag },
  { group: "Other", type: "whatsappRedirect", title: "WhatsApp", description: "Finish in WhatsApp", icon: MessageCircle },
  { group: "Advanced", type: "appointment", title: "Appointment", description: "Booking shell", icon: CalendarDays },
  { group: "Advanced", type: "fileUpload", title: "File Upload", description: "Provider shell", icon: FileUp },
  { group: "Advanced", type: "payment", title: "Payment", description: "Provider shell", icon: CreditCard },
  { group: "Logic & flow", type: "ruleSet", title: "Rule Set", description: "Pinned business rules", icon: ListTree },
  { group: "Logic & flow", type: "decisionTable", title: "Decision Table", description: "FIRST / UNIQUE policy", icon: GitBranch },
  { group: "Logic & flow", type: "condition", title: "Condition", description: "True / false", icon: GitBranch },
  { group: "Logic & flow", type: "setVariable", title: "Set Variable", description: "Store a value", icon: Variable },
  { group: "Logic & flow", type: "subflow", title: "Subflow", description: "Call a pinned component", icon: Blocks },
  { group: "Logic & flow", type: "start", title: "Start", description: "Entry point", icon: Play },
  { group: "Logic & flow", type: "end", title: "End", description: "Finish a path", icon: Flag },
  { group: "Logic & flow", type: "return", title: "Return", description: "Return to the parent", icon: CornerUpLeft },
];

const primaryGroups = ["Input", "Choice", "Rating", "Other", "Advanced"];

export function NodePalette({
  onAdd,
  mode = "bot",
}: {
  onAdd: (type: BuilderNodeType) => void;
  mode?: "bot" | "subflow";
}) {
  const startDrag = (event: React.DragEvent<HTMLButtonElement>, type: BuilderNodeType) => {
    event.dataTransfer.setData("application/reactflow", type);
    event.dataTransfer.effectAllowed = "move";
  };

  const availableItems = items.filter((item) => (mode === "bot" ? item.type !== "return" : item.type !== "end"));

  const renderItem = ({ type, title, description, icon: Icon }: (typeof items)[number]) => (
    <button
      className="palette-item"
      draggable
      key={type}
      title={description}
      onClick={() => onAdd(type)}
      onDragStart={(event) => startDrag(event, type)}
      type="button"
    >
      <span className={`palette-icon palette-icon-${type}`}>
        <Icon aria-hidden="true" size={17} />
      </span>
      <strong>{title}</strong>
    </button>
  );

  const technicalItems = availableItems.filter((item) => item.group === "Logic & flow");

  return (
    <aside className="builder-sidebar" aria-label="Node components">
      <div className="palette-list">
        {primaryGroups.map((group) => {
          const groupItems = availableItems.filter((item) => item.group === group);
          if (!groupItems.length) return null;
          return (
            <section className="palette-group" key={group}>
              <h3>
                {group}
                {group === "Advanced" ? <Crown aria-label="Advanced" size={12} /> : null}
              </h3>
              <div className="palette-group-grid">{groupItems.map(renderItem)}</div>
            </section>
          );
        })}

        <details className="palette-more">
          <summary>
            <span>Logic &amp; flow</span>
            <span>
              {technicalItems.length}
              <ChevronDown aria-hidden="true" size={15} />
            </span>
          </summary>
          <div className="palette-group-grid">{technicalItems.map(renderItem)}</div>
        </details>
      </div>
    </aside>
  );
}
