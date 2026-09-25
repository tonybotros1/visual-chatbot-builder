"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  Blocks,
  CheckCircle2,
  ChevronLeft,
  Cloud,
  Database,
  FileJson2,
  Save,
  Search,
  Send,
} from "lucide-react";
import { FlowCanvas } from "@/components/flow/FlowCanvas";
import { PropertiesPanel } from "@/components/properties/PropertiesPanel";
import { NodePalette } from "@/components/sidebar/NodePalette";
import { ContractEditor } from "@/components/subflows/ContractEditor";
import {
  getSubflow,
  getSubflowDraft,
  publishSubflow,
  saveSubflowDraft,
  validateSubflow,
} from "@/services/subflows";
import { useFlowStore } from "@/stores/flow-store";
import type { BuilderNodeType, FactSchema, FlowDocument } from "@/types/flow";


type SaveState = "idle" | "loading" | "saving" | "saved" | "local" | "error";

function localStorageKey(subflowId: string) {
  return `visual-chatbot-builder:subflow:${subflowId}:draft`;
}

export function SubflowWorkspace({ subflowId }: { subflowId: string }) {
  const router = useRouter();
  const addNode = useFlowStore((state) => state.addNode);
  const getDocument = useFlowStore((state) => state.getDocument);
  const isDirty = useFlowStore((state) => state.isDirty);
  const markSaved = useFlowStore((state) => state.markSaved);
  const searchQuery = useFlowStore((state) => state.searchQuery);
  const setGraph = useFlowStore((state) => state.setGraph);
  const setSearchQuery = useFlowStore((state) => state.setSearchQuery);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [message, setMessage] = useState("Loading component…");
  const [name, setName] = useState("Reusable component");
  const [inputSchema, setInputSchema] = useState<FactSchema>({});
  const [outputSchema, setOutputSchema] = useState<FactSchema>({});
  const [contractDirty, setContractDirty] = useState(false);
  const [showContract, setShowContract] = useState(false);

  const loadDraft = useCallback(async () => {
    const local = window.localStorage.getItem(localStorageKey(subflowId));
    if (local) {
      try {
        const snapshot = JSON.parse(local) as {
          flow_json: FlowDocument;
          input_schema: FactSchema;
          output_schema: FactSchema;
        };
        setGraph(snapshot.flow_json);
        setInputSchema(snapshot.input_schema);
        setOutputSchema(snapshot.output_schema);
      } catch {
        window.localStorage.removeItem(localStorageKey(subflowId));
      }
    }
    try {
      const [draft, subflow] = await Promise.all([getSubflowDraft(subflowId), getSubflow(subflowId)]);
      setGraph(draft.flow_json);
      setInputSchema(draft.input_schema);
      setOutputSchema(draft.output_schema);
      setName(subflow.name);
      setSaveState("saved");
      setMessage("Draft loaded from PostgreSQL");
      setContractDirty(false);
    } catch (caught) {
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) {
        router.replace("/login");
        return;
      }
      setSaveState(local ? "local" : "error");
      setMessage(local ? "Backend unavailable — browser draft loaded" : "Could not load component");
    }
  }, [router, setGraph, subflowId]);

  useEffect(() => { void loadDraft(); }, [loadDraft]);

  const handleSave = async (): Promise<boolean> => {
    const snapshot = {
      flow_json: getDocument(),
      input_schema: inputSchema,
      output_schema: outputSchema,
    };
    setSaveState("saving");
    setMessage("Saving component…");
    try {
      await saveSubflowDraft(subflowId, snapshot.flow_json, inputSchema, outputSchema);
      window.localStorage.removeItem(localStorageKey(subflowId));
      markSaved();
      setContractDirty(false);
      setSaveState("saved");
      setMessage("Saved to PostgreSQL");
      return true;
    } catch {
      window.localStorage.setItem(localStorageKey(subflowId), JSON.stringify(snapshot));
      markSaved();
      setContractDirty(false);
      setSaveState("local");
      setMessage("Backend unavailable — saved in this browser");
      return false;
    }
  };

  const handleValidate = async () => {
    if ((isDirty || contractDirty) && !(await handleSave())) return;
    try {
      const report = await validateSubflow(subflowId);
      const errors = report.issues.filter((issue) => issue.severity === "error");
      setMessage(report.valid ? `Component is valid${report.issues.length ? ` (${report.issues.length} warnings)` : ""}` : `${errors.length} validation errors`);
      setSaveState(report.valid ? "saved" : "error");
      if (!report.valid) window.alert(errors.map((issue) => issue.message).join("\n"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Validation failed");
      setSaveState("error");
    }
  };

  const handlePublish = async () => {
    if ((isDirty || contractDirty) && !(await handleSave())) return;
    try {
      const result = await publishSubflow(subflowId);
      setMessage(`Published immutable version ${result.version.version_number}`);
      setSaveState("saved");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Publish failed");
      setSaveState("error");
    }
  };

  const handleQuickAdd = (type: BuilderNodeType) => {
    const nodes = getDocument().nodes;
    const maxY = Math.max(0, ...nodes.map((node) => node.position.y));
    addNode(type, { x: 140 + (nodes.length % 3) * 270, y: maxY + 170 });
  };

  return (
    <main className="builder-page">
      <header className="builder-topbar">
        <div className="builder-brand">
          <Link href="/subflows" className="icon-button" aria-label="Back to components"><ChevronLeft size={19} /></Link>
          <span className="brand-mark brand-mark-small"><Blocks size={18} /></span>
          <div><strong>{name}</strong><span>Components / Draft definition</span></div>
        </div>
        <label className="builder-search">
          <Search size={16} />
          <input aria-label="Search nodes" placeholder="Search component…" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
        </label>
        <div className="builder-actions">
          <span className={`save-status save-status-${saveState}`}>
            {saveState === "saved" ? <Database size={14} /> : <Cloud size={14} />}
            {isDirty || contractDirty ? "Unsaved changes" : message}
          </span>
          <button className="secondary-button compact-action" onClick={() => setShowContract(true)} type="button"><FileJson2 size={15} /> Contract</button>
          <button className="secondary-button compact-action" onClick={() => void handleValidate()} type="button"><CheckCircle2 size={15} /> Validate</button>
          <button className="secondary-button compact-action" onClick={() => void handlePublish()} type="button"><Send size={15} /> Publish version</button>
          <button className="primary-button" onClick={() => void handleSave()} disabled={saveState === "saving"} type="button"><Save size={16} /> {saveState === "saving" ? "Saving…" : "Save draft"}</button>
        </div>
      </header>
      <div className="builder-layout">
        <NodePalette mode="subflow" onAdd={handleQuickAdd} />
        <ReactFlowProvider><FlowCanvas /></ReactFlowProvider>
        <PropertiesPanel />
      </div>
      {showContract ? (
        <ContractEditor
          inputSchema={inputSchema}
          outputSchema={outputSchema}
          onInputSchemaChange={(schema) => { setInputSchema(schema); setContractDirty(true); }}
          onOutputSchemaChange={(schema) => { setOutputSchema(schema); setContractDirty(true); }}
          onClose={() => setShowContract(false)}
        />
      ) : null}
    </main>
  );
}
