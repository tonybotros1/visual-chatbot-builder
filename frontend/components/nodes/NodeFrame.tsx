import type { ReactNode } from "react";

type NodeFrameProps = {
  tone: "start" | "message" | "question" | "condition" | "logic" | "data" | "integration" | "terminal";
  icon: ReactNode;
  kind: string;
  nodeNumber?: number;
  children: ReactNode;
  selected?: boolean;
};

export function NodeFrame({ tone, icon, kind, nodeNumber, children, selected }: NodeFrameProps) {
  return (
    <div className={`flow-node flow-node-${tone}${selected ? " is-selected" : ""}`}>
      <div className="flow-node-header">
        <span className="flow-node-icon">{icon}</span>
        <span className="flow-node-kind">{kind}</span>
        {nodeNumber ? <span className="flow-node-number">#{nodeNumber}</span> : null}
      </div>
      <div className="flow-node-body">{children}</div>
    </div>
  );
}
