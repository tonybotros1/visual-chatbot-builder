import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Link2, MessageSquareText } from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";

export const MessageNode = memo(function MessageNode({ data, selected, type }: NodeProps<BuilderNode>) {
  const isLinks = type === "links";
  const Icon = isLinks ? Link2 : MessageSquareText;
  return (
    <NodeFrame tone="message" icon={<Icon size={14} />} kind={isLinks ? "Links" : "Message"} nodeNumber={data.node_number} selected={selected}>
      <Handle type="target" position={Position.Left} />
      <RichText className="node-rich-label" content={data.label} />
      {isLinks ? <p>{data.links?.length ?? 0} linked actions</p> : null}
      <Handle type="source" position={Position.Right} />
    </NodeFrame>
  );
});
