"use client";

import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Inbox, Save, Search, Tag } from "lucide-react";
import { downloadResponses, listResponses, updateConversation } from "@/services/conversations";
import type { ConversationRecord } from "@/types/api";

const PAGE_SIZE = 10;

/** Readable fallback when a node no longer exists: "patient_name" → "Patient name". */
const humanize = (variable: string) => variable.replace(/[_-]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());

/** Visitor answers as text: lists joined, yes/no for booleans, file names for uploads, JSON for anything else. */
function formatAnswer(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map((item) => formatAnswer(item)).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.name === "string") return record.name;
    return JSON.stringify(value);
  }
  return String(value);
}

const statusOptions = [{ value: "active", label: "Active" }, { value: "completed", label: "Completed" }, { value: "qualified", label: "Qualified" }, { value: "spam", label: "Spam" }, { value: "archived", label: "Archived" }];

export default function ResponsesPage() {
  const { botId } = useParams<{ botId: string }>();
  const router = useRouter();
  const [items, setItems] = useState<ConversationRecord[]>([]);
  const [selected, setSelected] = useState<ConversationRecord | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagsText, setTagsText] = useState("");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    const haystack = `#${item.response_number} ${item.session_id} ${item.source} ${item.tags.join(" ")} ${JSON.stringify(item.variables)} ${item.answers.map((answer) => answer.answer_text || formatAnswer(answer.value)).join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }), [items, query, statusFilter]);

  // Ten responses per page; a new search or filter starts again from the first page.
  useEffect(() => { setPage(1); }, [query, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(filtered.length, currentPage * PAGE_SIZE);

  useEffect(() => {
    listResponses(botId).then(setItems).catch((caught) => {
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login");
      else setError(caught instanceof Error ? caught.message : "Could not load responses");
    });
  }, [botId, router]);

  const choose = (item: ConversationRecord) => {
    setSelected(item);
    setTagsText(item.tags.join(", "));
    setNote("");
  };

  const replace = (updated: ConversationRecord) => {
    setItems((records) => records.map((record) => record.id === updated.id ? updated : record));
    setSelected(updated);
    setTagsText(updated.tags.join(", "));
  };

  const saveOperations = async () => {
    if (!selected) return;
    try {
      const updated = await updateConversation(selected.id, { tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean), note: note.trim() || undefined });
      replace(updated); setNote("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update response"); }
  };

  return (
    <main className="responses-page">
      <header className="responses-header">
        <Link className="icon-button" href={`/bots/${botId}/builder`}><ChevronLeft size={18} /></Link>
        <div><p className="eyebrow">Responses</p><h1>Conversation activity</h1></div>
        <div className="response-export-actions">{(["csv", "json", "xlsx"] as const).map((format) => <button className="secondary-button" type="button" key={format} onClick={() => void downloadResponses(botId, format).catch((caught) => setError(caught instanceof Error ? caught.message : "Export failed"))}><Download size={14} /> {format.toUpperCase()}</button>)}</div>
      </header>
      {error ? <div className="form-error">{error}</div> : null}
      <section className="response-toolbar"><label><Search size={15} /><input placeholder="Search sessions, answers, tags…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><Select ariaLabel="Filter by status" value={statusFilter} options={[{ value: "all", label: "All statuses" }, ...statusOptions]} onChange={setStatusFilter} /><span>{filtered.length} responses</span></section>
      <div className="responses-layout">
        <section className="response-list">
          {filtered.length === 0 ? <div className="empty-dashboard"><Inbox size={26} /><h2>No matching responses</h2><p>Run a published chatbot or change the current filters.</p></div> : pageItems.map((item) => (
            <button type="button" className={selected?.id === item.id ? "response-row selected" : "response-row"} key={item.id} onClick={() => choose(item)}>
              <span className={`status-pill status-${item.status}`}>{item.status}</span>
              <strong>Response #{item.response_number}</strong>
              <small>{new Date(item.started_at).toLocaleString()}</small>
              <span>{item.answers.length} {item.answers.length === 1 ? "answer" : "answers"} · {item.source}{item.tags.length ? ` · ${item.tags.join(", ")}` : ""}</span>
            </button>
          ))}
          {filtered.length > PAGE_SIZE ? (
            <nav className="response-pagination" aria-label="Response pages">
              <button type="button" className="secondary-button compact-action" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /> Previous</button>
              <span>Showing {firstShown}–{lastShown} of {filtered.length} · page {currentPage} of {pageCount}</span>
              <button type="button" className="secondary-button compact-action" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next <ChevronRight size={14} /></button>
            </nav>
          ) : null}
        </section>
        <aside className="response-detail">
          {selected ? (
            <>
              <div className="response-detail-heading">
                <div><h2>Response #{selected.response_number}</h2><small>{new Date(selected.started_at).toLocaleString()} · {selected.source}</small></div>
                <Select size="sm" ariaLabel="Response status" value={selected.status} options={statusOptions} onChange={(status) => void updateConversation(selected.id, { status }).then(replace)} />
              </div>
              {selected.answers.length ? (
                <ol className="response-answers">
                  {selected.answers.map((answer, index) => (
                    <li key={answer.id}>
                      <span className="response-answer-index">{index + 1}</span>
                      <div>
                        <p className="response-question">{answer.question || humanize(answer.variable_name)}</p>
                        <p className="response-answer">{answer.answer_text || formatAnswer(answer.value)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="response-empty-answers">No answers yet. The visitor opened the chat but did not answer a question.</p>
              )}
              <section className="response-operations">
                <label><Tag size={14} /> Tags<input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="lead, priority, follow-up" /></label>
                <label>Internal note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for your team…" /></label>
                <button className="primary-button" type="button" onClick={() => void saveOperations()}><Save size={14} /> Save operations</button>
                {selected.notes.length ? <div className="response-notes">{selected.notes.map((entry, index) => <article key={`${entry.created_at}-${index}`}><p>{entry.text}</p><small>{new Date(entry.created_at).toLocaleString()}</small></article>)}</div> : null}
              </section>
              <details className="response-raw">
                <summary>Variables and metadata</summary>
                <pre>{JSON.stringify({ session_id: selected.session_id, variables: selected.variables, metadata: selected.metadata }, null, 2)}</pre>
              </details>
            </>
          ) : <div className="empty-properties"><strong>Select a response</strong><p>The visitor's answers, question by question, appear here.</p></div>}
        </aside>
      </div>
    </main>
  );
}
