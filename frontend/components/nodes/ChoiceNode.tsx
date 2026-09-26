import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ListChecks } from "lucide-react";
import type { BuilderNode } from "@/types/flow";
import { RichText } from "@/components/content/RichText";
import { NodeFrame } from "./NodeFrame";

export const ChoiceNode = memo(function ChoiceNode({ id, data, selected, type }: NodeProps<BuilderNode>) {
  const options = data.options?.length ? data.options : ["Option 1", "Option 2"];

  return (
    <NodeFrame
      tone="question"
      icon={<ListChecks size={14} />}
      kind={type === "multipleChoice" ? "Multiple choice" : "Single choice"}
      nodeId={id}
      nodeNumber={data.node_number}
      selected={selected}
    >
      <Handle type="target" position={Position.Left} />
      <RichText className="node-rich-label" content={data.label} />
      <div className="choice-options">
        {options.map((option, index) => (
          <div className="choice-option" key={`${option}-${index}`}>
            <span>{option}</span>
            <Handle
              id={`option-${index}`}
              className="choice-handle"
              type="source"
              position={Position.Right}
            />
          </div>
        ))}
        {data.required === false ? (
          <div className="choice-option choice-option-skip">
            <span>Skip</span>
            <Handle
              id="skip"
              className="choice-handle"
              type="source"
              position={Position.Right}
            />
          </div>
        ) : null}
      </div>
    </NodeFrame>
  );
});
