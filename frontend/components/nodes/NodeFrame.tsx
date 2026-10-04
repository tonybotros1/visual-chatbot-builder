"use client";

import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { confirmNodeDeletion } from "@/stores/dialog-store";
import { useFlowStore } from "@/stores/flow-store";

type NodeFrameProps = {
  tone: "start" | "message" | "question" | "condition" | "logic" | "data" | "integration" | "terminal";
  icon: ReactNode;
  kind: string;
  nodeId: string;
  nodeNumber?: number;
  children: ReactNode;
  selected?: boolean;
  deletable?: boolean;
};

export function NodeFrame({
  tone,
  icon,
  kind,
  nodeId,
  nodeNumber,
  children,
  selected,
  deletable = true,
}: NodeFrameProps) {
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const selectNode = useFlowStore((state) => state.selectNode);

  const keepQuickActionSeparate = (event: MouseEvent | PointerEvent) => {
    event.stopPropagation();
  };

  const deleteNode = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const nodeLabel = `${kind} node${nodeNumber ? ` #${nodeNumber}` : ""}`;
    if (!(await confirmNodeDeletion(nodeLabel))) return;
    onNodesChange([{ id: nodeId, type: "remove" }]);
    if (selected) selectNode(null);
  };

  return (
    <div className={`flow-node flow-node-${tone}${selected ? " is-selected" : ""}`}>
      {deletable ? (
        <div
          className="node-quick-actions nodrag nopan"
          aria-label={`Quick actions for node ${nodeNumber ?? ""}`.trim()}
          onClick={keepQuickActionSeparate}
          onPointerDown={keepQuickActionSeparate}
        >
          <button
            type="button"
            className="node-quick-action node-quick-action-delete nodrag nopan"
            aria-label={`Delete ${kind} node${nodeNumber ? ` ${nodeNumber}` : ""}`}
            title="Delete node"
            onClick={deleteNode}
            onPointerDown={keepQuickActionSeparate}
          >
            <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="flow-node-header">
        <span className="flow-node-icon">{icon}</span>
        <span className="flow-node-kind">{kind}</span>
        {nodeNumber ? <span className="flow-node-number">#{nodeNumber}</span> : null}
      </div>
      <div className="flow-node-body">{children}</div>
    </div>
  );
}
