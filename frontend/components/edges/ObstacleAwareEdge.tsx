"use client";

import { useMemo, useRef } from "react";
import { BaseEdge, Position, type EdgeProps } from "@xyflow/react";
import { useFlowStore } from "@/stores/flow-store";
import type { BuilderEdge, BuilderNode } from "@/types/flow";

type Point = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };

const NODE_CLEARANCE = 24;
const HANDLE_LEAD = 32;
const CORNER_RADIUS = 11;
const MAX_DETOUR_OBSTACLES = 24;

function samePoint(left: Point, right: Point) {
  return Math.abs(left.x - right.x) < 0.5 && Math.abs(left.y - right.y) < 0.5;
}

function simplifyPoints(points: Point[]) {
  const unique = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true;
    const previous = unique[index - 1];
    const next = unique[index + 1];
    const sameHorizontal = Math.abs(previous.y - point.y) < 0.5 && Math.abs(point.y - next.y) < 0.5;
    const sameVertical = Math.abs(previous.x - point.x) < 0.5 && Math.abs(point.x - next.x) < 0.5;
    return !sameHorizontal && !sameVertical;
  });
}

function roundedPath(points: Point[]) {
  const route = simplifyPoints(points);
  if (route.length < 2) return "";

  let path = `M ${route[0].x} ${route[0].y}`;
  for (let index = 1; index < route.length - 1; index += 1) {
    const previous = route[index - 1];
    const current = route[index];
    const next = route[index + 1];
    const incomingLength = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y);
    const radius = Math.min(CORNER_RADIUS, incomingLength / 2, outgoingLength / 2);
    const before = {
      x: current.x + ((previous.x - current.x) / incomingLength) * radius,
      y: current.y + ((previous.y - current.y) / incomingLength) * radius,
    };
    const after = {
      x: current.x + ((next.x - current.x) / outgoingLength) * radius,
      y: current.y + ((next.y - current.y) / outgoingLength) * radius,
    };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const last = route[route.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function segmentHitsRect(start: Point, end: Point, rect: Rect) {
  const epsilon = 0.5;
  if (Math.abs(start.y - end.y) < epsilon) {
    const y = start.y;
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    return y > rect.top && y < rect.bottom && right > rect.left && left < rect.right;
  }
  if (Math.abs(start.x - end.x) < epsilon) {
    const x = start.x;
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    return x > rect.left && x < rect.right && bottom > rect.top && top < rect.bottom;
  }
  return false;
}

function routeIsClear(points: Point[], obstacles: Rect[]) {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (obstacles.some((obstacle) => segmentHitsRect(points[index], points[index + 1], obstacle))) {
      return false;
    }
  }
  return true;
}

function routeLength(points: Point[]) {
  return points.slice(1).reduce(
    (length, point, index) => length + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y),
    0,
  );
}

function routeMidpoint(points: Point[]) {
  const totalLength = routeLength(points);
  let travelled = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentLength = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    if (travelled + segmentLength >= totalLength / 2) {
      const ratio = segmentLength ? (totalLength / 2 - travelled) / segmentLength : 0;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    travelled += segmentLength;
  }
  return points[Math.floor(points.length / 2)];
}

function leadPoint(point: Point, position: Position, distance: number): Point {
  if (position === Position.Left) return { x: point.x - distance, y: point.y };
  if (position === Position.Top) return { x: point.x, y: point.y - distance };
  if (position === Position.Bottom) return { x: point.x, y: point.y + distance };
  return { x: point.x + distance, y: point.y };
}

function buildRoute(
  source: Point,
  target: Point,
  sourcePosition: Position,
  targetPosition: Position,
  obstacles: Rect[],
) {
  const sourceLead = leadPoint(source, sourcePosition, HANDLE_LEAD);
  const targetLead = leadPoint(target, targetPosition, HANDLE_LEAD);
  // Every candidate segment lies between the leftmost and rightmost of these x values,
  // so nodes outside that horizontal band can never be hit and are ignored up front.
  const minX = Math.min(source.x, sourceLead.x, target.x, targetLead.x);
  const maxX = Math.max(source.x, sourceLead.x, target.x, targetLead.x);
  const relevant = obstacles.filter((obstacle) => obstacle.right > minX && obstacle.left < maxX);
  const midY = (sourceLead.y + targetLead.y) / 2;
  // Dense columns can still leave dozens of obstacles in the band; the detour rows that
  // matter are the ones nearest the edge, so cap how many we try.
  const detourObstacles = relevant.length > MAX_DETOUR_OBSTACLES
    ? [...relevant]
        .sort((left, right) => Math.abs((left.top + left.bottom) / 2 - midY) - Math.abs((right.top + right.bottom) / 2 - midY))
        .slice(0, MAX_DETOUR_OBSTACLES)
    : relevant;
  const obstacleRoutes = detourObstacles.flatMap((obstacle) => [obstacle.top - 12, obstacle.bottom + 12]);
  const routeYs = [
    sourceLead.y,
    targetLead.y,
    (sourceLead.y + targetLead.y) / 2,
    Math.min(sourceLead.y, targetLead.y) - 64,
    Math.max(sourceLead.y, targetLead.y) + 64,
    ...obstacleRoutes,
  ];

  const candidates = [...new Set(routeYs.map((value) => Math.round(value * 2) / 2))].map((routeY) => [
    source,
    sourceLead,
    { x: sourceLead.x, y: routeY },
    { x: targetLead.x, y: routeY },
    targetLead,
    target,
  ]);

  const clearRoutes = candidates.filter((candidate) => routeIsClear(candidate, relevant));
  const availableRoutes = clearRoutes.length ? clearRoutes : candidates;
  return availableRoutes.sort((left, right) => {
    const leftScore = routeLength(left) + simplifyPoints(left).length * 10;
    const rightScore = routeLength(right) + simplifyPoints(right).length * 10;
    return leftScore - rightScore;
  })[0];
}

export function ObstacleAwareEdge({
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  markerStart,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  interactionWidth,
}: EdgeProps<BuilderEdge>) {
  const nodes = useFlowStore((state) => state.nodes);
  // While a node is being dragged the store emits a new node list on every pointer move.
  // Keep routing against the last settled layout so only the edges whose endpoints move
  // recompute; everything re-routes once when the drag ends.
  const isDragging = nodes.some((node) => node.dragging);
  const settledNodes = useRef<BuilderNode[]>(nodes);
  if (!isDragging) settledNodes.current = nodes;
  const obstacleNodes = settledNodes.current;

  const points = useMemo(() => {
    const obstacles = obstacleNodes
      .filter((node) => node.id !== source && node.id !== target && !node.hidden)
      .map((node) => {
        const width = node.measured?.width ?? node.width ?? 220;
        const height = node.measured?.height ?? node.height ?? 120;
        return {
          left: node.position.x - NODE_CLEARANCE,
          right: node.position.x + width + NODE_CLEARANCE,
          top: node.position.y - NODE_CLEARANCE,
          bottom: node.position.y + height + NODE_CLEARANCE,
        };
      });
    return buildRoute(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      sourcePosition,
      targetPosition,
      obstacles,
    );
  }, [obstacleNodes, source, sourcePosition, sourceX, sourceY, target, targetPosition, targetX, targetY]);
  const labelPoint = routeMidpoint(points);

  return (
    <BaseEdge
      path={roundedPath(points)}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={style}
      label={label}
      labelX={labelPoint.x}
      labelY={labelPoint.y}
      labelStyle={labelStyle}
      labelShowBg={labelShowBg}
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
      interactionWidth={interactionWidth}
    />
  );
}
