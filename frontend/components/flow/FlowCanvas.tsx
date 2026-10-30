"use client";

import { useCallback, useEffect, useMemo, type Ref } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useUpdateNodeInternals,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import { useFlowStore } from "@/stores/flow-store";
import { richTextToPlainText } from "@/components/content/RichText";
import type { BuilderNode, BuilderNodeType } from "@/types/flow";
import { ChoiceNode } from "@/components/nodes/ChoiceNode";
import { ConditionNode } from "@/components/nodes/ConditionNode";
import { EndNode } from "@/components/nodes/EndNode";
import { InputNode } from "@/components/nodes/InputNode";
import { MessageNode } from "@/components/nodes/MessageNode";
import { SetVariableNode } from "@/components/nodes/SetVariableNode";
import { StartNode } from "@/components/nodes/StartNode";
import { SubflowNode } from "@/components/nodes/SubflowNode";
import { ReturnNode } from "@/components/nodes/ReturnNode";
import { LogicNode } from "@/components/nodes/LogicNode";
import { ObstacleAwareEdge } from "@/components/edges/ObstacleAwareEdge";

const nodeTypes: NodeTypes = {
  start: StartNode,
  message: MessageNode,
  choice: ChoiceNode,
  singleChoice: ChoiceNode,
  multipleChoice: ChoiceNode,
  textInput: InputNode,
  numberInput: InputNode,
  emailInput: InputNode,
  phoneInput: InputNode,
  searchableList: InputNode,
  rangeInput: InputNode,
  ratingInput: InputNode,
  opinionScale: InputNode,
  dateInput: InputNode,
  fileUpload: InputNode,
  payment: InputNode,
  appointment: InputNode,
  ruleSet: LogicNode,
  decisionTable: LogicNode,
  links: MessageNode,
  thankYou: EndNode,
  whatsappRedirect: EndNode,
  condition: ConditionNode,
  setVariable: SetVariableNode,
  subflow: SubflowNode,
  return: ReturnNode,
  end: EndNode,
};

const edgeTypes: EdgeTypes = {
  obstacle: ObstacleAwareEdge,
};

function nodeMatchesQuery(node: BuilderNode, query: string) {
  const numberQuery = query.startsWith("#") ? query.slice(1) : query;
  return richTextToPlainText(node.data.label).toLowerCase().includes(query) || String(node.data.node_number ?? "") === numberQuery;
}

const minimapColors: Record<BuilderNodeType, string> = {
  start: "#F5B942",
  message: "#38BDF8",
  choice: "#00A1B0",
  singleChoice: "#00A1B0",
  multipleChoice: "#00A1B0",
  textInput: "#00A1B0",
  numberInput: "#00A1B0",
  emailInput: "#00A1B0",
  phoneInput: "#00A1B0",
  searchableList: "#00A1B0",
  rangeInput: "#00A1B0",
  ratingInput: "#00A1B0",
  opinionScale: "#00A1B0",
  dateInput: "#00A1B0",
  fileUpload: "#38BDF8",
  payment: "#38BDF8",
  appointment: "#38BDF8",
  ruleSet: "#7C3AED",
  decisionTable: "#7C3AED",
  links: "#38BDF8",
  thankYou: "#F5B942",
  whatsappRedirect: "#F5B942",
  condition: "#F5B942",
  setVariable: "#A78BFA",
  subflow: "#7C3AED",
  return: "#7C3AED",
  end: "#F5B942",
};

export function FlowCanvas({ canvasRef }: { canvasRef?: Ref<HTMLDivElement> }) {
  const router = useRouter();
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  const searchQuery = useFlowStore((state) => state.searchQuery);
  const layoutRevision = useFlowStore((state) => state.layoutRevision);
  const onNodesChange = useFlowStore((state) => state.onNodesChange);
  const onEdgesChange = useFlowStore((state) => state.onEdgesChange);
  const onConnect = useFlowStore((state) => state.onConnect);
  const addNode = useFlowStore((state) => state.addNode);
  const selectNode = useFlowStore((state) => state.selectNode);
  const { fitView, screenToFlowPosition, setCenter } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow") as BuilderNodeType;
      if (!type) return;
      addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNode, screenToFlowPosition],
  );

  // Nodes that match the search keep full opacity and get a ring; the rest fade back.
  const displayNodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return nodes;
    return nodes.map((node) => ({ ...node, className: nodeMatchesQuery(node, query) ? "is-search-match" : "is-search-miss" }));
  }, [nodes, searchQuery]);

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    const match = nodes.find((node) => nodeMatchesQuery(node, query));
    if (!match) return;
    void setCenter(match.position.x + 110, match.position.y + 70, {
      zoom: 1.15,
      duration: 350,
    });
  }, [nodes, searchQuery, setCenter]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      nodes.forEach((node) => updateNodeInternals(node.id));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [nodes, updateNodeInternals]);

  useEffect(() => {
    if (!layoutRevision) return;
    const firstFrame = window.requestAnimationFrame(() => {
      useFlowStore.getState().nodes.forEach((node) => updateNodeInternals(node.id));
      const secondFrame = window.requestAnimationFrame(() => {
        void fitView({ padding: 0.18, duration: 500 });
      });
      return () => window.cancelAnimationFrame(secondFrame);
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [fitView, layoutRevision, updateNodeInternals]);

  return (
    <div ref={canvasRef} className="flow-canvas" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: "obstacle" }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={() => selectNode(null)}
        onNodeClick={(_, node) => selectNode(node.id)}
        onNodeDoubleClick={(_, node) => {
          if (node.type === "subflow" && node.data.subflow_id) {
            router.push(`/subflows/${node.data.subflow_id}/builder`);
          }
          if ((node.type === "ruleSet" || node.type === "decisionTable") && node.data.logic_asset_id) {
            router.push(`/logic/${node.data.logic_asset_id}`);
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={1.8}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background color="#DED9E2" gap={22} size={1} variant={BackgroundVariant.Dots} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => minimapColors[(node.type ?? "message") as BuilderNodeType]}
          nodeStrokeWidth={3}
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  );
}
