"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Check, CheckCircle2, ChevronDown, ChevronUp, Copy, FileCode2, Hammer, ListChecks, XCircle } from "lucide-react";
import { checkScript, exportScript, getScriptRules, type ScriptCheck, type ScriptIssue } from "@/services/botScript";
import { copyText } from "@/services/clipboard";
import { confirmDialog } from "@/stores/dialog-store";
import { useFlowStore } from "@/stores/flow-store";

const languageNames: Record<string, string> = { en: "English", ar: "Arabic", fr: "French", es: "Spanish", de: "German", tr: "Turkish", ur: "Urdu", hi: "Hindi" };

/**
 * The Code tab: write (or paste) a whole chatbot as Bot Script and build its flow from it.
 * The rules sit above the code box so they can be copied to whoever writes the code. Check only
 * reads; Build replaces the flow on the canvas, which stays undoable and unsaved like any other edit.
 */
export function CodeWorkspace({ botId, botName, onBuilt }: { botId: string; botName: string; onBuilt: (summary: string) => void }) {
  const storageKey = `spaghetti:code:${botId}`;
  const replaceGraph = useFlowStore((state) => state.replaceGraph);
  const getDocument = useFlowStore((state) => state.getDocument);
  const nodeCount = useFlowStore((state) => state.nodes.length);

  const [code, setCode] = useState("");
  const [rules, setRules] = useState("");
  const [example, setExample] = useState("");
  const [rulesOpen, setRulesOpen] = useState(true);
  const [copied, setCopied] = useState("");
  const [result, setResult] = useState<ScriptCheck | null>(null);
  /** The code the current result belongs to; a result for older text must not allow a build. */
  const [checkedCode, setCheckedCode] = useState("");
  const [busy, setBusy] = useState<"" | "check" | "build" | "export">("");
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setCode(window.localStorage.getItem(storageKey) ?? "");
      if (window.localStorage.getItem("spaghetti:code-rules") === "closed") setRulesOpen(false);
    } catch {
      /* storage unavailable */
    }
    getScriptRules()
      .then((loaded) => {
        setRules(loaded.rules);
        setExample(loaded.example);
      })
      .catch(() => setNotice({ tone: "error", text: "The rules could not be loaded. Check your connection and reopen this tab." }));
  }, [storageKey]);

  const updateCode = (next: string) => {
    setCode(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      /* storage unavailable */
    }
  };

  const toggleRules = () => {
    setRulesOpen((open) => {
      try {
        window.localStorage.setItem("spaghetti:code-rules", open ? "closed" : "open");
      } catch {
        /* storage unavailable */
      }
      return !open;
    });
  };

  const copy = async (text: string, key: string) => {
    if (await copyText(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1600);
    }
  };

  const lineCount = useMemo(() => Math.max(1, code.split("\n").length), [code]);
  const isCurrent = result !== null && checkedCode === code;
  const errors = isCurrent ? result.issues.filter((issue) => issue.severity === "error") : [];
  const warnings = isCurrent ? result.issues.filter((issue) => issue.severity === "warning") : [];
  const flaggedLines = useMemo(() => {
    const lines = new Map<number, "error" | "warning">();
    if (isCurrent) {
      for (const issue of result.issues) {
        if (issue.line && lines.get(issue.line) !== "error") lines.set(issue.line, issue.severity);
      }
    }
    return lines;
  }, [isCurrent, result]);

  const runCheck = useCallback(async (): Promise<ScriptCheck | null> => {
    setBusy("check");
    setNotice(null);
    try {
      const checked = await checkScript(code);
      setResult(checked);
      setCheckedCode(code);
      return checked;
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "The code could not be checked." });
      return null;
    } finally {
      setBusy("");
    }
  }, [code]);

  const goToLine = (line: number | null) => {
    const area = editor.current;
    if (!area || !line) return;
    const lines = code.split("\n");
    const start = lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
    area.focus();
    area.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
    const lineHeight = parseFloat(window.getComputedStyle(area).lineHeight) || 20;
    area.scrollTop = Math.max(0, (line - 4) * lineHeight);
  };

  const build = async () => {
    const checked = isCurrent && result ? result : await runCheck();
    if (!checked) return;
    if (!checked.ok || !checked.flow) {
      setNotice({ tone: "error", text: "Fix the problems listed below, then build again." });
      return;
    }
    const existing = Math.max(0, nodeCount - 1);
    if (existing > 0) {
      const confirmed = await confirmDialog({
        title: "Replace this bot's flow?",
        message: `The ${existing} step${existing === 1 ? "" : "s"} now on the canvas will be replaced by the ${checked.nodes - 1} built from this code. Colours, avatar and layout stay as they are. You can undo with Ctrl+Z, and nothing is saved until you press Save draft.`,
        confirmLabel: "Build bot",
      });
      if (!confirmed) return;
    }
    setBusy("build");
    try {
      replaceGraph(checked.flow);
      onBuilt(`Built ${checked.steps} steps from code — review them, then Save draft`);
    } finally {
      setBusy("");
    }
  };

  const showAsCode = async () => {
    if (code.trim()) {
      const confirmed = await confirmDialog({
        title: "Replace the code in the box?",
        message: "The code now in the box will be replaced by this bot written as code.",
        confirmLabel: "Replace code",
      });
      if (!confirmed) return;
    }
    setBusy("export");
    setNotice(null);
    try {
      const document = getDocument();
      const exported = await exportScript({ nodes: document.nodes, edges: document.edges }, botName);
      updateCode(exported.code);
      setResult(null);
      setNotice(exported.warnings.length ? { tone: "error", text: exported.warnings.join(" ") } : { tone: "info", text: "This is the bot as it is on the canvas now. Edit it and press Build bot to apply your changes." });
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "The bot could not be written as code." });
    } finally {
      setBusy("");
    }
  };

  const useExample = async () => {
    if (code.trim()) {
      const confirmed = await confirmDialog({ title: "Replace the code in the box?", message: "The code now in the box will be replaced by the example from the rules.", confirmLabel: "Use example" });
      if (!confirmed) return;
    }
    updateCode(example);
    setResult(null);
    setNotice(null);
  };

  const issueRow = (issue: ScriptIssue, index: number) => (
    <li key={`${issue.line}-${index}`} className={`is-${issue.severity}`}>
      <button type="button" disabled={!issue.line} onClick={() => goToLine(issue.line)} title={issue.line ? "Go to this line" : undefined}>
        {issue.severity === "error" ? <XCircle size={15} /> : <AlertTriangle size={15} />}
        <span className="code-issue-line">{issue.line ? `Line ${issue.line}` : "Whole bot"}</span>
        <span className="code-issue-text">{issue.message}</span>
      </button>
    </li>
  );

  return (
    <section className="code-workspace" aria-label="Build the bot from code">
      <div className="code-container">
        <header className="code-heading">
          <div>
            <span className="code-eyebrow"><FileCode2 size={14} /> Bot Script</span>
            <h1>Build the whole bot from code</h1>
            <p>Give the rules below, together with your script document, to whoever writes the code. Paste the code here, check it, then build.</p>
          </div>
        </header>

        <article className={`code-rules${rulesOpen ? " is-open" : ""}`}>
          <div className="code-rules-head">
            <button type="button" className="code-rules-toggle" aria-expanded={rulesOpen} onClick={toggleRules}>
              <BookOpen size={16} />
              <strong>Writing rules</strong>
              <span>{rulesOpen ? "Hide" : "Show"}</span>
              {rulesOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            <button type="button" className="secondary-button compact-action" disabled={!rules} onClick={() => void copy(rules, "rules")}>
              {copied === "rules" ? <Check size={14} /> : <Copy size={14} />} {copied === "rules" ? "Copied" : "Copy rules"}
            </button>
          </div>
          {rulesOpen ? <pre className="code-rules-body" dir="ltr" tabIndex={0}>{rules || "Loading the rules…"}</pre> : null}
        </article>

        <article className="code-editor-card">
          <div className="code-editor-head">
            <strong>Code</strong>
            <span>{code.trim() ? `${lineCount} lines` : "Empty"}</span>
            <div className="code-editor-actions">
              <button type="button" className="secondary-button compact-action" disabled={!example} onClick={() => void useExample()}>Use the example</button>
              <button type="button" className="secondary-button compact-action" disabled={busy !== "" || nodeCount < 2} onClick={() => void showAsCode()}>
                <FileCode2 size={14} /> {busy === "export" ? "Writing…" : "Show this bot as code"}
              </button>
            </div>
          </div>
          <div className="code-editor">
            <div className="code-gutter" ref={gutter} aria-hidden="true">
              {Array.from({ length: lineCount }, (_, index) => (
                <span key={index} className={flaggedLines.has(index + 1) ? `is-${flaggedLines.get(index + 1)}` : ""}>{index + 1}</span>
              ))}
            </div>
            <textarea
              ref={editor}
              aria-label="Bot Script code"
              dir="ltr"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              placeholder={"bot: My bot\nlanguages: en, ar\n\n[welcome] message\nen: Hello!\nar: مرحباً!\n\n[goodbye] end\nen: Thank you.\nar: شكراً لك."}
              value={code}
              onChange={(event) => updateCode(event.target.value)}
              onScroll={(event) => { if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop; }}
            />
          </div>
          <div className="code-actions">
            <button type="button" className="secondary-button" disabled={busy !== "" || !code.trim()} onClick={() => void runCheck()}>
              <ListChecks size={15} /> {busy === "check" ? "Checking…" : "Check code"}
            </button>
            <button type="button" className="primary-button" disabled={busy !== "" || !code.trim() || (isCurrent && !result.ok)} onClick={() => void build()}>
              <Hammer size={15} /> {busy === "build" ? "Building…" : "Build bot"}
            </button>
            <span className="code-actions-note">Check only reads the code. Build replaces the flow on the canvas and can be undone.</span>
          </div>
        </article>

        {notice ? <p className={`code-notice is-${notice.tone}`}>{notice.text}</p> : null}

        {isCurrent ? (
          <article className={`code-result${result.ok ? " is-ok" : " is-failed"}`} aria-live="polite">
            <div className="code-result-head">
              {result.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <div>
                <strong>{result.ok ? "The code is ready to build" : `${errors.length} problem${errors.length === 1 ? "" : "s"} to fix`}</strong>
                <span>
                  {result.steps} step{result.steps === 1 ? "" : "s"}
                  {result.ok ? ` · ${result.nodes - 1} on the canvas` : ""}
                  {` · ${result.questions} question${result.questions === 1 ? "" : "s"}`}
                  {` · ${result.languages.map((language) => languageNames[language] ?? language).join(" + ")}`}
                  {warnings.length ? ` · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}
                </span>
              </div>
            </div>
            {result.issues.length ? <ul className="code-issues">{[...errors, ...warnings].map(issueRow)}</ul> : null}
          </article>
        ) : result !== null ? (
          <p className="code-notice is-info">The code changed since the last check. Check it again before building.</p>
        ) : null}
      </div>
    </section>
  );
}
