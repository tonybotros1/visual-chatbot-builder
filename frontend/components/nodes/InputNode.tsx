import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  AtSign,
  CalendarDays,
  CreditCard,
  FileUp,
  Gauge,
  Hash,
  Phone,
  Search,
  SlidersHorizontal,
  Star,
  TextCursorInput,
} from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";

const config = {
  textInput: { kind: "Text input", icon: TextCursorInput, tone: "question" as const },
  numberInput: { kind: "Number input", icon: Hash, tone: "question" as const },
  emailInput: { kind: "Email input", icon: AtSign, tone: "question" as const },
  phoneInput: { kind: "Phone input", icon: Phone, tone: "question" as const },
  searchableList: { kind: "Searchable list", icon: Search, tone: "question" as const },
  rangeInput: { kind: "Range", icon: SlidersHorizontal, tone: "question" as const },
  ratingInput: { kind: "Rating", icon: Star, tone: "question" as const },
  opinionScale: { kind: "Opinion scale", icon: Gauge, tone: "question" as const },
  dateInput: { kind: "Date", icon: CalendarDays, tone: "question" as const },
  fileUpload: { kind: "File upload shell", icon: FileUp, tone: "integration" as const },
  payment: { kind: "Payment shell", icon: CreditCard, tone: "integration" as const },
  appointment: { kind: "Appointment shell", icon: CalendarDays, tone: "integration" as const },
};

export const InputNode = memo(function InputNode({ data, selected, type }: NodeProps<BuilderNode>) {
  const selectedConfig = config[type as keyof typeof config] ?? config.textInput;
  const Icon = selectedConfig.icon;
  return (
    <NodeFrame tone={selectedConfig.tone} icon={<Icon size={14} />} kind={selectedConfig.kind} nodeNumber={data.node_number} selected={selected}>
      <Handle type="target" position={Position.Left} />
      <RichText className="node-rich-label" content={data.label} />
      <p>{data.variable ? `Saves to ${data.variable}` : "Variable not set"}</p>
      <Handle type="source" position={Position.Right} />
    </NodeFrame>
  );
});
