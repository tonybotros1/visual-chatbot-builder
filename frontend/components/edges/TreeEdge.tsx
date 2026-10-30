"use client";

import { BaseEdge, Position, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import type { BuilderEdge } from "@/types/flow";

/**
 * Parent-to-child connector for the tree layout. Plain source handles are moved to the bottom of the
 * card by CSS, so the path leaves downward; option, skip and condition handles stay on the right of
 * their row, so those paths leave sideways first and then drop to the child.
 */
export function TreeEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourceHandleId,
  markerEnd,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  interactionWidth,
}: EdgeProps<BuilderEdge>) {
  const leavesSideways = Boolean(sourceHandleId);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: leavesSideways ? Position.Right : Position.Bottom,
    targetPosition: Position.Top,
    borderRadius: 12,
    offset: leavesSideways ? 24 : 20,
  });
  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={style}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={labelStyle}
      labelShowBg={labelShowBg}
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
      interactionWidth={interactionWidth}
    />
  );
}
