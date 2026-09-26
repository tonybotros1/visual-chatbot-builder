import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ExternalLink, MessageCircle, Square } from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";

export const EndNode = memo(function EndNode({ id, data, selected, type }: NodeProps<BuilderNode>) {
  const config = type === "thankYou"
    ? { kind: "Thank you / CTA", icon: ExternalLink }
    : type === "whatsappRedirect"
      ? { kind: "WhatsApp redirect", icon: MessageCircle }
      : { kind: "End", icon: Square };
  const Icon = config.icon;
  return (
    <NodeFrame tone="terminal" icon={<Icon size={13} />} kind={config.kind} nodeId={id} nodeNumber={data.node_number} selected={selected}>
      <Handle type="target" position={Position.Left} />
      <RichText className="node-rich-label" content={data.label} />
    </NodeFrame>
  );
});
