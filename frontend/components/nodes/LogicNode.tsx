import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitCompareArrows, ListTree } from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";


export const LogicNode = memo(function LogicNode({ id, data, selected, type }: NodeProps<BuilderNode>) {
  const isDecision = type === "decisionTable";
  const Icon = isDecision ? GitCompareArrows : ListTree;
  return (
    <NodeFrame tone="logic" icon={<Icon size={14} />} kind={isDecision ? "Decision table" : "Rule set"} nodeId={id} nodeNumber={data.node_number} selected={selected}>
      <Handle type="target" position={Position.Left} />
      <RichText className="node-rich-label" content={data.label} />
      <p>{data.version_number ? `Pinned version ${data.version_number}` : "Published version required"}</p>
      <Handle type="source" position={Position.Right} />
    </NodeFrame>
  );
});
