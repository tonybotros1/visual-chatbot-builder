import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Variable } from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";

export const SetVariableNode = memo(function SetVariableNode({ data, selected }: NodeProps<BuilderNode>) {
  return (
    <NodeFrame tone="data" icon={<Variable size={14} />} kind="Set variable" nodeNumber={data.node_number} selected={selected}>
      <Handle type="target" position={Position.Left} />
      <RichText className="node-rich-label" content={data.label} />
      <p>{`${data.variable || "variable"} = ${String(data.value ?? "")}`}</p>
      <Handle type="source" position={Position.Right} />
    </NodeFrame>
  );
});
