import type { BuilderEdge, BuilderNode } from "@/types/flow";

export type TreeLayout = {
  /** Computed top-down positions for every visible node. */
  positions: Map<string, { x: number; y: number }>;
  /** Nodes hidden because an ancestor is collapsed. */
  hidden: Set<string>;
  /** Edge ids that form the tree (parent to child); every other edge is a jump. */
  treeEdgeIds: Set<string>;
  /** Number of children each node has in the tree (0 for leaves). */
  childCount: Map<string, number>;
};

const DEFAULT_WIDTH = 260;
const DEFAULT_HEIGHT = 120;
const COLUMN_GAP = 36;
const ROW_GAP = 90;

export function edgeKey(edge: BuilderEdge) {
  return edge.id ?? `${edge.source}->${edge.target}#${edge.sourceHandle ?? ""}`;
}

/** Sort a node's outgoing edges in the order the visitor sees them: option-0, option-1, …, skip, true, false, then the rest. */
function handleRank(handle: string | null | undefined) {
  if (!handle) return 0;
  const option = /^option-(\d+)$/.exec(handle);
  if (option) return 1 + Number(option[1]);
  if (handle === "skip") return 500;
  if (handle === "true") return 600;
  if (handle === "false") return 601;
  return 700;
}

/**
 * Lay the flow out as a strict top-down tree. Each node hangs under the first node that reaches it
 * (walking from Start in option order); any other connection into it is reported as a jump edge.
 * Parents are centred over their children, rows are spaced by the tallest card in the row.
 */
export function buildTreeLayout(nodes: BuilderNode[], edges: BuilderEdge[], collapsed: Set<string>): TreeLayout {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, BuilderEdge[]>();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }
  for (const list of outgoing.values()) {
    list.sort((left, right) => handleRank(left.sourceHandle) - handleRank(right.sourceHandle));
  }

  // Breadth-first from Start so shared nodes attach to the shallowest parent.
  const parent = new Map<string, string | null>();
  const children = new Map<string, string[]>();
  const depth = new Map<string, number>();
  const treeEdgeIds = new Set<string>();
  const roots: string[] = [];
  const start = nodes.find((node) => node.type === "start") ?? nodes[0];
  const queue: string[] = [];
  const visit = (rootId: string) => {
    parent.set(rootId, null);
    depth.set(rootId, 0);
    roots.push(rootId);
    queue.push(rootId);
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of outgoing.get(current) ?? []) {
        if (parent.has(edge.target)) continue;
        parent.set(edge.target, current);
        depth.set(edge.target, (depth.get(current) ?? 0) + 1);
        treeEdgeIds.add(edgeKey(edge));
        const siblings = children.get(current) ?? [];
        siblings.push(edge.target);
        children.set(current, siblings);
        queue.push(edge.target);
      }
    }
  };
  if (start) visit(start.id);
  for (const node of nodes) {
    if (!parent.has(node.id)) visit(node.id);
  }

  // Collapsed branches: everything below a collapsed node is hidden.
  const hidden = new Set<string>();
  const hideBelow = (id: string) => {
    for (const child of children.get(id) ?? []) {
      hidden.add(child);
      hideBelow(child);
    }
  };
  for (const id of collapsed) if (children.has(id)) hideBelow(id);

  const width = (id: string) => byId.get(id)?.measured?.width ?? byId.get(id)?.width ?? DEFAULT_WIDTH;
  const height = (id: string) => byId.get(id)?.measured?.height ?? byId.get(id)?.height ?? DEFAULT_HEIGHT;
  const visibleChildren = (id: string) => (collapsed.has(id) ? [] : (children.get(id) ?? []));

  // Row heights come from the tallest visible card in each row.
  const rowHeight = new Map<number, number>();
  for (const node of nodes) {
    if (hidden.has(node.id)) continue;
    const row = depth.get(node.id) ?? 0;
    rowHeight.set(row, Math.max(rowHeight.get(row) ?? 0, height(node.id)));
  }
  const rowY = (row: number) => {
    let y = 0;
    for (let index = 0; index < row; index += 1) y += (rowHeight.get(index) ?? DEFAULT_HEIGHT) + ROW_GAP;
    return y;
  };

  // Pass 1: subtree widths. Pass 2: assign x so every parent is centred over its children.
  const subtreeWidth = new Map<string, number>();
  const measure = (id: string): number => {
    const kids = visibleChildren(id);
    const own = width(id);
    if (!kids.length) {
      subtreeWidth.set(id, own);
      return own;
    }
    const total = kids.reduce((sum, child, index) => sum + measure(child) + (index ? COLUMN_GAP : 0), 0);
    const result = Math.max(own, total);
    subtreeWidth.set(id, result);
    return result;
  };
  const positions = new Map<string, { x: number; y: number }>();
  const place = (id: string, left: number) => {
    const span = subtreeWidth.get(id) ?? width(id);
    positions.set(id, { x: left + (span - width(id)) / 2, y: rowY(depth.get(id) ?? 0) });
    const kids = visibleChildren(id);
    if (!kids.length) return;
    const total = kids.reduce((sum, child, index) => sum + (subtreeWidth.get(child) ?? 0) + (index ? COLUMN_GAP : 0), 0);
    let cursor = left + (span - total) / 2;
    for (const child of kids) {
      place(child, cursor);
      cursor += (subtreeWidth.get(child) ?? 0) + COLUMN_GAP;
    }
  };
  let cursor = 0;
  for (const root of roots) {
    measure(root);
    place(root, cursor);
    cursor += (subtreeWidth.get(root) ?? 0) + COLUMN_GAP * 3;
  }

  const childCount = new Map<string, number>();
  for (const [id, kids] of children) childCount.set(id, kids.length);
  return { positions, hidden, treeEdgeIds, childCount };
}
