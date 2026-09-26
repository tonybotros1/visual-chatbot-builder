import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play } from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";

export const StartNode = memo(function StartNode({ id, data, selected }: NodeProps<BuilderNode>) {
  return (
    <NodeFrame tone="start" icon={<Play size={14} />} kind="Start" nodeId={id} nodeNumber={data.node_number} selected={selected} deletable={false}>
      <RichText className="node-rich-label" content={data.label} />
      <Handle type="source" position={Position.Right} />
    </NodeFrame>
  );
});
