import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";

export const ConditionNode = memo(function ConditionNode({ id, data, selected }: NodeProps<BuilderNode>) {
  return (
    <NodeFrame tone="condition" icon={<GitBranch size={14} />} kind="Condition" nodeId={id} nodeNumber={data.node_number} selected={selected}>
      <Handle type="target" position={Position.Left} />
      <RichText className="node-rich-label" content={data.label} />
      <p>{`${data.variable || "variable"} ${data.operator || "=="} ${String(data.value ?? "value")}`}</p>
      <div className="logic-outputs">
        <span>True <Handle id="true" type="source" position={Position.Right} /></span>
        <span>False <Handle id="false" type="source" position={Position.Right} /></span>
      </div>
    </NodeFrame>
  );
});
