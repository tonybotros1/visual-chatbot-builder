import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import { create } from "zustand";
import type {
  BuilderEdge,
  BuilderNode,
  BuilderNodeData,
  BuilderNodeType,
  FlowAppearance,
  FlowDocument,
  FlowSettings,
} from "@/types/flow";

export type CanvasViewMode = "detailed" | "compact";
export const CANVAS_VIEW_KEY = "spaghetti:canvas-view";
export type CanvasLayoutMode = "flow" | "tree";
export const CANVAS_LAYOUT_KEY = "spaghetti:canvas-layout";

export const defaultFlowAppearance: FlowAppearance = {
  title: "Spaghetti chatbot",
  description: "",
  primary_color: "#7C3AED",
  background_color: "#FFFFFF",
  surface_color: "#FFFFFF",
  text_color: "#211D29",
  avatar_url: "",
  layout_style: "card",
};

export const defaultFlowSettings: FlowSettings = {
  enabled: true,
  show_progress_bar: false,
  response_delay_seconds: 0,
  delivery_mode: "widget",
  timezone: "Asia/Dubai",
  collect_visitor_context: true,
  email_notifications_enabled: true,
  send_incomplete_notifications: false,
  notification_from_email: "",
  notification_to_emails: [],
  notification_subject: "New response from Spaghetti",
  notification_subject_append: "none",
  notification_reply_to_variable: "",
  notification_filters: [],
};

export const initialNodes: BuilderNode[] = [
  {
    id: "start",
    type: "start",
    position: { x: 80, y: 220 },
    data: { label: "Start" },
  },
  {
    id: "welcome-message",
    type: "message",
    position: { x: 350, y: 210 },
    data: {
      label: "Welcome! Let's check your eligibility.",
    },
  },
  {
    id: "continue-choice",
    type: "singleChoice",
    position: { x: 665, y: 190 },
    data: {
      label: "Would you like to continue?",
      variable: "continue_choice",
      required: true,
      options: ["Yes", "No"],
    },
  },
  {
    id: "yes-end",
    type: "end",
    position: { x: 1020, y: 95 },
    data: { label: "Continue path complete" },
  },
  {
    id: "no-end",
    type: "end",
    position: { x: 1020, y: 330 },
    data: { label: "Conversation ended" },
  },
];

export const initialEdges: BuilderEdge[] = [
  { id: "start-welcome", source: "start", target: "welcome-message" },
  { id: "welcome-choice", source: "welcome-message", target: "continue-choice" },
  {
    id: "choice-yes",
    source: "continue-choice",
    sourceHandle: "option-0",
    target: "yes-end",
    label: "Yes",
  },
  {
    id: "choice-no",
    source: "continue-choice",
    sourceHandle: "option-1",
    target: "no-end",
    label: "No",
  },
];

const edgeDefaults = {
  type: "obstacle",
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2 },
};

const branchingNodeTypes = new Set<BuilderNodeType>(["choice", "singleChoice", "multipleChoice", "condition"]);

function outputSlot(node: BuilderNode, sourceHandle?: string | null): string {
  return branchingNodeTypes.has(node.type)
    ? `${node.id}:${sourceHandle ?? "default"}`
    : node.id;
}

function normalizeNodeNumbers(nodes: BuilderNode[]): BuilderNode[] {
  const used = new Set<number>();
  let nextNumber = 1;

  return nodes.map((node) => {
    const requested = node.data.node_number;
    let nodeNumber = Number.isInteger(requested) && Number(requested) > 0
      ? Number(requested)
      : undefined;

    if (nodeNumber !== undefined && used.has(nodeNumber)) nodeNumber = undefined;
    if (nodeNumber === undefined) {
      while (used.has(nextNumber)) nextNumber += 1;
      nodeNumber = nextNumber;
    }

    used.add(nodeNumber);
    nextNumber = Math.max(nextNumber, nodeNumber + 1);
    return { ...node, data: { ...node.data, node_number: nodeNumber } };
  });
}

function sanitizeEdges(nodes: BuilderNode[], edges: BuilderEdge[]): BuilderEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const occupiedOutputs = new Set<string>();
  const result: BuilderEdge[] = [];

  // New connections are appended by React Flow. Walking backwards means a new
  // connection replaces the old connection from the same output handle.
  for (let index = edges.length - 1; index >= 0; index -= 1) {
    const edge = edges[index];
    const sourceNode = nodeById.get(edge.source);
    if (!sourceNode || !nodeById.has(edge.target)) continue;
    const slot = outputSlot(sourceNode, edge.sourceHandle);
    if (occupiedOutputs.has(slot)) continue;
    occupiedOutputs.add(slot);
    result.push(edge);
  }
  return result.reverse();
}

function cleanNodes(nodes: BuilderNode[]): BuilderNode[] {
  return normalizeNodeNumbers(nodes).map((node) => ({
    id: node.id,
    type: node.type,
    position: { ...node.position },
    data: cloneNodeData(node.data),
  }));
}

function cleanEdges(nodes: BuilderNode[], edges: BuilderEdge[]): BuilderEdge[] {
  return sanitizeEdges(nodes, edges).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    ...(edge.label ? { label: edge.label } : {}),
  }));
}

function nodeSortValue(node: BuilderNode): number {
  if (node.type === "start") return -1;
  return node.data.node_number ?? Number.MAX_SAFE_INTEGER;
}

function autoLayoutNodes(nodes: BuilderNode[], edges: BuilderEdge[]): BuilderNode[] {
  if (nodes.length < 2) return nodes.map((node) => ({ ...node, position: { ...node.position } }));

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const indegree = new Map(nodes.map((node) => [node.id, 0]));

  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target) || edge.source === edge.target) return;
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  });

  const compareIds = (leftId: string, rightId: string) => {
    const left = nodeById.get(leftId);
    const right = nodeById.get(rightId);
    if (!left || !right) return leftId.localeCompare(rightId);
    return nodeSortValue(left) - nodeSortValue(right) || left.position.y - right.position.y;
  };

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)
    .sort(compareIds);
  const layerById = new Map(nodes.map((node) => [node.id, 0]));
  const processed = new Set<string>();

  while (queue.length) {
    const sourceId = queue.shift()!;
    processed.add(sourceId);
    const sourceLayer = layerById.get(sourceId) ?? 0;

    for (const targetId of outgoing.get(sourceId) ?? []) {
      layerById.set(targetId, Math.max(layerById.get(targetId) ?? 0, sourceLayer + 1));
      const remaining = (indegree.get(targetId) ?? 1) - 1;
      indegree.set(targetId, remaining);
      if (remaining === 0) {
        queue.push(targetId);
        queue.sort(compareIds);
      }
    }
  }

  // Cycles do not have a topological root. Walk each remaining component once
  // so it still receives clear, progressive columns without an infinite loop.
  const remaining = nodes.map((node) => node.id).filter((id) => !processed.has(id)).sort(compareIds);
  for (const componentRoot of remaining) {
    if (processed.has(componentRoot)) continue;
    const knownParentLayers = (incoming.get(componentRoot) ?? [])
      .filter((id) => processed.has(id))
      .map((id) => layerById.get(id) ?? 0);
    const rootLayer = knownParentLayers.length ? Math.max(...knownParentLayers) + 1 : 0;
    const componentQueue: Array<{ id: string; layer: number }> = [{ id: componentRoot, layer: rootLayer }];

    while (componentQueue.length) {
      const current = componentQueue.shift()!;
      if (processed.has(current.id)) continue;
      processed.add(current.id);
      layerById.set(current.id, current.layer);
      for (const targetId of outgoing.get(current.id) ?? []) {
        if (!processed.has(targetId)) componentQueue.push({ id: targetId, layer: current.layer + 1 });
      }
    }
  }

  const layers = new Map<number, BuilderNode[]>();
  nodes.forEach((node) => {
    const layer = layerById.get(node.id) ?? 0;
    layers.set(layer, [...(layers.get(layer) ?? []), node]);
  });

  const orderById = new Map<string, number>();
  const layerNumbers = [...layers.keys()].sort((left, right) => left - right);
  layerNumbers.forEach((layerNumber) => {
    const layerNodes = layers.get(layerNumber)!;
    layerNodes.sort((left, right) => {
      const leftParents = (incoming.get(left.id) ?? []).map((id) => orderById.get(id)).filter((value): value is number => value !== undefined);
      const rightParents = (incoming.get(right.id) ?? []).map((id) => orderById.get(id)).filter((value): value is number => value !== undefined);
      const leftScore = leftParents.length ? leftParents.reduce((sum, value) => sum + value, 0) / leftParents.length : nodeSortValue(left);
      const rightScore = rightParents.length ? rightParents.reduce((sum, value) => sum + value, 0) / rightParents.length : nodeSortValue(right);
      return leftScore - rightScore || nodeSortValue(left) - nodeSortValue(right) || left.position.y - right.position.y;
    });
    layerNodes.forEach((node, index) => orderById.set(node.id, index));
  });

  const dimensions = new Map(nodes.map((node) => [
    node.id,
    {
      width: node.measured?.width ?? node.width ?? 260,
      height: node.measured?.height ?? node.height ?? (branchingNodeTypes.has(node.type) ? 170 : 120),
    },
  ]));
  const rowGap = 72;
  const columnGap = 120;
  const columnHeights = new Map<number, number>();
  const columnWidths = new Map<number, number>();

  layerNumbers.forEach((layerNumber) => {
    const layerNodes = layers.get(layerNumber)!;
    columnHeights.set(
      layerNumber,
      layerNodes.reduce((sum, node) => sum + dimensions.get(node.id)!.height, 0) + Math.max(0, layerNodes.length - 1) * rowGap,
    );
    columnWidths.set(layerNumber, Math.max(...layerNodes.map((node) => dimensions.get(node.id)!.width)));
  });

  const canvasHeight = Math.max(...columnHeights.values());
  const positionById = new Map<string, XYPosition>();
  let x = 80;

  layerNumbers.forEach((layerNumber) => {
    const layerNodes = layers.get(layerNumber)!;
    let y = 80 + (canvasHeight - columnHeights.get(layerNumber)!) / 2;
    layerNodes.forEach((node) => {
      positionById.set(node.id, { x, y });
      y += dimensions.get(node.id)!.height + rowGap;
    });
    x += columnWidths.get(layerNumber)! + columnGap;
  });

  return nodes.map((node) => ({ ...node, position: positionById.get(node.id) ?? node.position }));
}

function uniqueNodeData(type: BuilderNodeType, nodes: BuilderNode[]): BuilderNodeData {
  const data = cloneNodeData(nodeDefaults[type]);
  if (!data.variable) return data;
  const used = new Set(nodes.map((node) => node.data.variable).filter(Boolean));
  const base = data.variable;
  let suffix = 2;
  while (used.has(data.variable)) {
    data.variable = `${base}_${suffix}`;
    suffix += 1;
  }
  return data;
}

const nodeDefaults: Record<BuilderNodeType, BuilderNodeData> = {
  start: { label: "Start" },
  message: { label: "New message" },
  textInput: { label: "Enter text", variable: "text_answer", required: true },
  numberInput: { label: "Enter a number", variable: "number_answer", required: true },
  emailInput: { label: "What is your email?", variable: "email", required: true },
  phoneInput: { label: "What is your phone number?", variable: "phone", required: true },
  singleChoice: {
    label: "Choose an option",
    variable: "choice_answer",
    required: true,
    options: ["Option 1", "Option 2"],
  },
  choice: {
    label: "Choose an option",
    variable: "choice_answer",
    required: true,
    options: ["Option 1", "Option 2"],
  },
  multipleChoice: {
    label: "Choose one or more",
    variable: "multiple_answers",
    required: true,
    options: ["Option 1", "Option 2"],
    option_values: ["option_1", "option_2"],
  },
  searchableList: {
    label: "Search and choose",
    variable: "list_answer",
    required: true,
    options: ["Option 1", "Option 2", "Option 3"],
    option_values: ["option_1", "option_2", "option_3"],
  },
  rangeInput: {
    label: "Choose a value",
    variable: "range_answer",
    required: true,
    min_value: 0,
    max_value: 100,
    step: 1,
  },
  ratingInput: {
    label: "How would you rate this?",
    variable: "rating",
    required: true,
    min_value: 1,
    max_value: 5,
    step: 1,
  },
  opinionScale: {
    label: "How likely are you to recommend us?",
    variable: "opinion_score",
    required: true,
    min_value: 0,
    max_value: 10,
    step: 1,
  },
  dateInput: {
    label: "Choose a date",
    variable: "selected_date",
    required: true,
  },
  fileUpload: {
    label: "Upload a file",
    variable: "uploaded_files",
    required: true,
    storage_provider: "local",
    file_types: ["application/pdf", "image/jpeg", "image/png"],
    max_file_size_mb: 10,
    max_files: 1,
  },
  links: {
    label: "Useful links",
    links: [{ label: "Learn more", url: "https://example.com", link_type: "website", new_tab: true }],
  },
  thankYou: {
    label: "Thank you!",
    cta_label: "Continue",
    cta_url: "https://example.com",
  },
  whatsappRedirect: {
    label: "Continue on WhatsApp",
    whatsapp_phone: "",
    whatsapp_message: "Hello, I completed the form.",
  },
  payment: {
    label: "Complete payment",
    variable: "payment_result",
    required: true,
    provider: "sandbox",
    amount: 0,
    currency: "USD",
  },
  appointment: {
    label: "Book an appointment",
    variable: "appointment_result",
    required: true,
    provider: "local",
    duration_minutes: 30,
  },
  ruleSet: {
    label: "Reusable rule set",
    logic_kind: "rule_set",
    inputs: {},
    outputs: {},
    input_schema: {},
    output_schema: {},
  },
  decisionTable: {
    label: "Decision table",
    logic_kind: "decision_table",
    inputs: {},
    outputs: {},
    input_schema: {},
    output_schema: {},
  },
  condition: {
    label: "Check a condition",
    variable: "choice_answer",
    operator: "==",
    value: "Option 1",
  },
  setVariable: { label: "Set a variable", variable: "result", value: "complete" },
  subflow: {
    label: "Reusable component",
    inputs: {},
    outputs: {},
    input_schema: {},
    output_schema: {},
  },
  return: { label: "Return to parent" },
  end: { label: "End" },
};

type FlowState = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  appearance: FlowAppearance;
  settings: FlowSettings;
  selectedNodeId: string | null;
  searchQuery: string;
  layoutRevision: number;
  /** Canvas density. "detailed" shows full node content; "compact" clamps it and focuses the selection. */
  viewMode: CanvasViewMode;
  /** "flow" uses saved positions; "tree" computes a top-down tree and ignores them. */
  layoutMode: CanvasLayoutMode;
  /** Tree-mode branches folded by the user (node ids). */
  collapsedNodeIds: string[];
  isDirty: boolean;
  onNodesChange: (changes: NodeChange<BuilderNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<BuilderEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  setJumpTarget: (
    sourceId: string,
    targetId: string | null,
    sourceHandle?: string | null,
    label?: string,
  ) => void;
  addNode: (type: BuilderNodeType, position: XYPosition) => void;
  updateNodeData: (nodeId: string, updates: Partial<BuilderNodeData>) => void;
  updateAppearance: (updates: Partial<FlowAppearance>) => void;
  updateSettings: (updates: Partial<FlowSettings>) => void;
  selectNode: (nodeId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: CanvasViewMode) => void;
  setLayoutMode: (mode: CanvasLayoutMode) => void;
  toggleCollapsed: (nodeId: string) => void;
  formatLayout: () => void;
  setGraph: (document: FlowDocument) => void;
  getDocument: () => FlowDocument;
  markSaved: () => void;
};

function cloneNodeData(data: BuilderNodeData): BuilderNodeData {
  return {
    ...data,
    options: data.options?.slice(),
    option_values: data.option_values?.slice(),
    allowed_domains: data.allowed_domains?.slice(),
    file_types: data.file_types?.slice(),
    links: data.links?.map((link) => ({ ...link })),
    inputs: data.inputs ? { ...data.inputs } : undefined,
    outputs: data.outputs ? { ...data.outputs } : undefined,
    input_schema: data.input_schema ? { ...data.input_schema } : undefined,
    output_schema: data.output_schema ? { ...data.output_schema } : undefined,
  };
}

function cloneInitialNodes() {
  return normalizeNodeNumbers(
    initialNodes.map((node) => ({ ...node, data: cloneNodeData(node.data) })),
  );
}

function cloneInitialEdges() {
  return initialEdges.map((edge) => ({ ...edge, ...edgeDefaults }));
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: cloneInitialNodes(),
  edges: cloneInitialEdges(),
  appearance: { ...defaultFlowAppearance },
  settings: { ...defaultFlowSettings },
  selectedNodeId: null,
  searchQuery: "",
  layoutRevision: 0,
  viewMode: "detailed",
  layoutMode: "flow",
  collapsedNodeIds: [],
  isDirty: false,

  onNodesChange: (changes) =>
    set((state) => {
      const nodes = applyNodeChanges(changes, state.nodes);
      const edges = sanitizeEdges(nodes, state.edges);
      return {
        nodes,
        edges,
        isDirty:
          state.isDirty ||
          edges.length !== state.edges.length ||
          changes.some((change) =>
            ["add", "remove", "replace", "position"].includes(change.type),
          ),
      };
    }),

  onEdgesChange: (changes) =>
    set((state) => ({
      edges: sanitizeEdges(state.nodes, applyEdgeChanges(changes, state.edges)),
      isDirty:
        state.isDirty ||
        changes.some((change) => ["add", "remove", "replace"].includes(change.type)),
    })),

  onConnect: (connection) =>
    set((state) => ({
      edges: sanitizeEdges(
        state.nodes,
        addEdge({ ...connection, ...edgeDefaults }, state.edges),
      ),
      isDirty: true,
    })),

  setJumpTarget: (sourceId, targetId, sourceHandle = null, label) =>
    set((state) => {
      const sourceNode = state.nodes.find((node) => node.id === sourceId);
      if (!sourceNode || targetId === sourceId) return state;

      const slot = outputSlot(sourceNode, sourceHandle);
      const remainingEdges = state.edges.filter((edge) =>
        edge.source !== sourceId || outputSlot(sourceNode, edge.sourceHandle) !== slot,
      );
      const edges = targetId
        ? [
            ...remainingEdges,
            {
              id: `jump-${sourceId}-${sourceHandle ?? "default"}-${targetId}`,
              source: sourceId,
              target: targetId,
              ...(sourceHandle ? { sourceHandle } : {}),
              ...(label ? { label } : {}),
              ...edgeDefaults,
            },
          ]
        : remainingEdges;

      return {
        edges: sanitizeEdges(state.nodes, edges),
        isDirty: true,
      };
    }),

  addNode: (type, position) =>
    set((state) => {
      const id = `${type}-${crypto.randomUUID()}`;
      const nextNodeNumber = Math.max(
        0,
        ...state.nodes.map((node) => node.data.node_number ?? 0),
      ) + 1;
      return {
        nodes: [
          ...state.nodes,
          {
            id,
            type,
            position,
            data: {
              ...uniqueNodeData(type, state.nodes),
              node_number: nextNodeNumber,
            },
          },
        ],
        selectedNodeId: null,
        isDirty: true,
      };
    }),

  updateNodeData: (nodeId, updates) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...updates } } : node,
      ),
      isDirty: true,
    })),

  updateAppearance: (updates) =>
    set((state) => ({
      appearance: { ...state.appearance, ...updates },
      isDirty: true,
    })),

  updateSettings: (updates) =>
    set((state) => ({
      settings: { ...state.settings, ...updates },
      isDirty: true,
    })),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setViewMode: (viewMode) => {
    try {
      window.localStorage.setItem(CANVAS_VIEW_KEY, viewMode);
    } catch {
      // Private windows may refuse storage; the choice still applies for this page.
    }
    set({ viewMode });
  },
  setLayoutMode: (layoutMode) => {
    try {
      window.localStorage.setItem(CANVAS_LAYOUT_KEY, layoutMode);
    } catch {
      // Storage unavailable: the choice still applies for this page.
    }
    set({ layoutMode });
  },
  toggleCollapsed: (nodeId) =>
    set((state) => ({
      collapsedNodeIds: state.collapsedNodeIds.includes(nodeId)
        ? state.collapsedNodeIds.filter((id) => id !== nodeId)
        : [...state.collapsedNodeIds, nodeId],
    })),
  formatLayout: () =>
    set((state) => ({
      nodes: autoLayoutNodes(state.nodes, state.edges),
      layoutRevision: state.layoutRevision + 1,
      isDirty: true,
    })),

  setGraph: (document) => {
    const nodes = cleanNodes(document.nodes);
    const sanitized = cleanEdges(nodes, document.edges);
    const loadedAppearance = { ...defaultFlowAppearance, ...(document.appearance ?? {}) };
    const hasLegacyDefaultDescription = loadedAppearance.description === "We are online and ready to help.";
    if (hasLegacyDefaultDescription) loadedAppearance.description = "";
    set({
      nodes,
      edges: sanitized.map((edge) => ({ ...edge, ...edgeDefaults })),
      appearance: loadedAppearance,
      settings: { ...defaultFlowSettings, ...(document.settings ?? {}) },
      selectedNodeId: null,
      // Bumping the revision makes the canvas fit the loaded flow; the mount-time fitView ran on an empty graph.
      layoutRevision: get().layoutRevision + 1,
      // Node numbers are re-derived on every save, so assigning them on load is not an unsaved change.
      isDirty: sanitized.length !== document.edges.length || hasLegacyDefaultDescription,
    });
  },

  getDocument: () => {
    const nodes = cleanNodes(get().nodes);
    return {
      nodes,
      edges: cleanEdges(nodes, get().edges),
      variables: [],
      appearance: { ...get().appearance },
      settings: { ...get().settings },
    };
  },

  markSaved: () => set({ isDirty: false }),

}));
