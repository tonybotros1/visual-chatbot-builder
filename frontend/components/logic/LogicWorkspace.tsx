"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, FileJson2, FlaskConical, Save, Send } from "lucide-react";
import { ContractEditor } from "@/components/subflows/ContractEditor";
import { evaluateLogic, getLogicAsset, getLogicDraft, publishLogic, saveLogicDraft, validateLogic } from "@/services/logic";
import type { FactSchema } from "@/types/flow";
import { alertDialog } from "@/stores/dialog-store";


export function LogicWorkspace({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [name, setName] = useState("Reusable logic");
  const [kind, setKind] = useState("rule_set");
  const [definitionText, setDefinitionText] = useState("{}");
  const [inputSchema, setInputSchema] = useState<FactSchema>({});
  const [outputSchema, setOutputSchema] = useState<FactSchema>({});
  const [factsText, setFactsText] = useState("{}");
  const [resultText, setResultText] = useState("");
  const [message, setMessage] = useState("Loading draft…");
  const [dirty, setDirty] = useState(false);
  const [showContract, setShowContract] = useState(false);

  const load = useCallback(async () => {
    try {
      const [asset, draft] = await Promise.all([getLogicAsset(assetId), getLogicDraft(assetId)]);
      setName(asset.name);
      setKind(asset.kind);
      setDefinitionText(JSON.stringify(draft.definition, null, 2));
      setInputSchema(draft.input_schema);
      setOutputSchema(draft.output_schema);
      setMessage("Draft loaded from PostgreSQL");
      setDirty(false);
    } catch (caught) {
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login");
      else setMessage(caught instanceof Error ? caught.message : "Could not load logic draft");
    }
  }, [assetId, router]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    try {
      const definition = JSON.parse(definitionText) as Record<string, unknown>;
      await saveLogicDraft(assetId, definition, inputSchema, outputSchema);
      setMessage("Saved to PostgreSQL");
      setDirty(false);
      return true;
    } catch (caught) {
      setMessage(caught instanceof SyntaxError ? "Definition JSON is invalid" : caught instanceof Error ? caught.message : "Save failed");
      return false;
    }
  };

  const validate = async () => {
    if (dirty && !(await save())) return;
    try {
      const report = await validateLogic(assetId);
      const errors = report.issues.filter((issue) => issue.severity === "error");
      setMessage(report.valid ? `Definition is valid${report.issues.length ? ` (${report.issues.length} notices)` : ""}` : `${errors.length} validation errors`);
      if (!report.valid) void alertDialog({ title: `${errors.length} validation ${errors.length === 1 ? "error" : "errors"}`, message: errors.map((issue) => issue.message).join("\n") });
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Validation failed");
    }
  };

  const publish = async () => {
    if (dirty && !(await save())) return;
    try {
      const response = await publishLogic(assetId);
      setMessage(`Published immutable version ${response.version.version_number}`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Publish failed");
    }
  };

  const evaluate = async () => {
    if (dirty && !(await save())) return;
    try {
      const facts = JSON.parse(factsText) as Record<string, unknown>;
      const response = await evaluateLogic(assetId, facts);
      setResultText(JSON.stringify(response, null, 2));
      setMessage("Evaluation completed");
    } catch (caught) {
      setMessage(caught instanceof SyntaxError ? "Test facts JSON is invalid" : caught instanceof Error ? caught.message : "Evaluation failed");
    }
  };

  return (
    <main className="logic-editor-page">
      <header className="logic-editor-header">
        <div className="builder-brand"><Link href="/logic" className="icon-button" aria-label="Back to logic library"><ChevronLeft size={19} /></Link><div><strong>{name}</strong><span>{kind === "rule_set" ? "Rule set" : "Decision table"} / Draft definition</span></div></div>
        <span className="save-status">{dirty ? "Unsaved changes" : message}</span>
        <div className="builder-actions">
          <button className="secondary-button" type="button" onClick={() => setShowContract(true)}><FileJson2 size={15} /> Contract</button>
          <button className="secondary-button" type="button" onClick={() => void validate()}><CheckCircle2 size={15} /> Validate</button>
          <button className="secondary-button" type="button" onClick={() => void publish()}><Send size={15} /> Publish</button>
          <button className="primary-button" type="button" onClick={() => void save()}><Save size={15} /> Save</button>
        </div>
      </header>
      <section className="logic-editor-grid">
        <article className="logic-editor-card logic-definition-card">
          <div><p className="eyebrow">Executable definition</p><h1>{kind === "rule_set" ? "Rules JSON" : "Decision table JSON"}</h1></div>
          <textarea aria-label="Logic definition JSON" spellCheck={false} value={definitionText} onChange={(event) => { setDefinitionText(event.target.value); setDirty(true); }} />
        </article>
        <aside className="logic-editor-card logic-test-card">
          <div><p className="eyebrow">Deterministic test</p><h2>Evaluate draft</h2></div>
          <label>Input facts<textarea aria-label="Test facts JSON" spellCheck={false} value={factsText} onChange={(event) => setFactsText(event.target.value)} /></label>
          <button className="primary-button" type="button" onClick={() => void evaluate()}><FlaskConical size={15} /> Run evaluation</button>
          <pre>{resultText || "Evaluation output and matched rows appear here."}</pre>
        </aside>
      </section>
      {showContract ? <ContractEditor inputSchema={inputSchema} outputSchema={outputSchema} onInputSchemaChange={(schema) => { setInputSchema(schema); setDirty(true); }} onOutputSchemaChange={(schema) => { setOutputSchema(schema); setDirty(true); }} onClose={() => setShowContract(false)} title="Logic contract" help="Inputs are the only facts this asset may read. Outputs are explicitly mapped back into the calling flow." /> : null}
    </main>
  );
}
