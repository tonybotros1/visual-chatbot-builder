import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CornerUpLeft } from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";


export const ReturnNode = memo(function ReturnNode({ data, selected }: NodeProps<BuilderNode>) {
  return (
    <NodeFrame tone="logic" icon={<CornerUpLeft size={14} />} kind="Return" nodeNumber={data.node_number} selected={selected}>
      <Handle type="target" position={Position.Left} />
      <RichText className="node-rich-label" content={data.label} />
      <p>Map outputs back to the parent flow</p>
    </NodeFrame>
  );
});
