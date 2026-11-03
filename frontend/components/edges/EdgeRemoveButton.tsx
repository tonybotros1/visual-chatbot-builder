"use client";

import { X } from "lucide-react";
import { useFlowStore } from "@/stores/flow-store";

const SIZE = 22;

/**
 * A small "x" at the middle of a connection. It lives inside the edge's own <g>, so it appears when the
 * line is hovered or selected (see .edge-remove in globals.css) and removes the connection on click.
 */
export function EdgeRemoveButton({ edgeId, x, y }: { edgeId: string; x: number; y: number }) {
  const removeEdge = useFlowStore((state) => state.removeEdge);
  return (
    <foreignObject className="edge-remove-wrap" width={SIZE} height={SIZE} x={x - SIZE / 2} y={y - SIZE / 2} requiredExtensions="http://www.w3.org/1999/xhtml">
      <button
        type="button"
        className="edge-remove nodrag nopan"
        title="Remove this connection"
        aria-label="Remove this connection"
        onClick={(event) => {
          event.stopPropagation();
          removeEdge(edgeId);
        }}
      >
        <X size={12} />
      </button>
    </foreignObject>
  );
}
