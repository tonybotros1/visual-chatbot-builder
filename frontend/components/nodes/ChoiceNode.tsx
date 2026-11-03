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
          <div className={data.single_next ? "choice-option choice-option-plain" : "choice-option"} key={`${option}-${index}`}>
            <span>{option}</span>
            {data.single_next ? null : (
              <Handle
                id={`option-${index}`}
                className="choice-handle"
                type="source"
                position={Position.Right}
              />
            )}
          </div>
        ))}
        {data.single_next ? (
          <div className="choice-option choice-option-next">
            <span>Next</span>
            <Handle id="next" className="choice-handle" type="source" position={Position.Right} />
          </div>
        ) : null}
        {data.required === false && !data.single_next ? (
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
