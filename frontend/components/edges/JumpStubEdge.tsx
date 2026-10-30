"use client";

import { BaseEdge, EdgeLabelRenderer, useReactFlow, type EdgeProps } from "@xyflow/react";
import { CornerDownRight } from "lucide-react";
import { useFlowStore } from "@/stores/flow-store";
import type { BuilderEdge } from "@/types/flow";

/**
 * In the tree layout a node is drawn once, under its first parent. Any other connection into it is
 * shown as a short stub ending in a chip with the target's number; clicking the chip pans to it.
 */
export function JumpStubEdge({ id, target, sourceX, sourceY, sourceHandleId, label, style }: EdgeProps<BuilderEdge>) {
  const { fitView } = useReactFlow();
  const targetNumber = useFlowStore((state) => state.nodes.find((node) => node.id === target)?.data.node_number);
  const sideways = Boolean(sourceHandleId);
  const endX = sideways ? sourceX + 28 : sourceX;
  const endY = sideways ? sourceY : sourceY + 26;
  const path = `M ${sourceX} ${sourceY} L ${endX} ${endY}`;
  const text = `${label ? `${String(label)} · ` : ""}#${targetNumber ?? "?"}`;
  return (
    <>
      <BaseEdge id={id} path={path} style={{ ...style, strokeDasharray: "4 4" }} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="tree-jump-chip nodrag nopan"
          style={{ transform: `translate(${sideways ? "0" : "-50%"}, -50%) translate(${endX}px, ${endY}px)` }}
          title={`Continues at node #${targetNumber ?? "?"}`}
          onClick={(event) => {
            event.stopPropagation();
            void fitView({ nodes: [{ id: target }], duration: 400, padding: 1.2, maxZoom: 1.1 });
          }}
        >
          <CornerDownRight size={12} aria-hidden />
          {text}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
