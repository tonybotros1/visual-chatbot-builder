import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Blocks } from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";


export const SubflowNode = memo(function SubflowNode({ id, data, selected }: NodeProps<BuilderNode>) {
  const inputCount = Object.keys(data.input_schema ?? {}).length;
  const outputCount = Object.keys(data.output_schema ?? {}).length;
  return (
    <NodeFrame tone="logic" icon={<Blocks size={14} />} kind="Subflow" nodeId={id} nodeNumber={data.node_number} selected={selected}>
      <Handle type="target" position={Position.Left} />
      <RichText className="node-rich-label" content={data.subflow_name || data.label || "Select a component"} />
      <p>
        {data.version_number ? `Pinned to v${data.version_number}` : "Published version required"}
        {data.version_number ? ` · ${inputCount} in / ${outputCount} out` : ""}
      </p>
      <Handle type="source" position={Position.Right} />
    </NodeFrame>
  );
});
