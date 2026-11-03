"use client";

import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, Globe, Inbox, LayoutList, MapPin, MessagesSquare, Monitor, Save, Search, Smartphone, Table2, Tablet, Tag, X } from "lucide-react";
import { downloadResponses, listResponses, updateConversation } from "@/services/conversations";
import type { ConversationRecord } from "@/types/api";

const PAGE_SIZE = 10;
type ViewMode = "list" | "table";
const VIEW_KEY = "spaghetti:responses-view";
type AnswerRecord = ConversationRecord["answers"][number];

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

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : "");

/** What was captured about the visitor when the chat started (address, device, location, page). */
function visitorOf(item: ConversationRecord) {
  const meta = item.metadata ?? {};
  const place = [text(meta.city), text(meta.region), text(meta.country)].filter(Boolean);
  const device = text(meta.device);
  return {
    ip: text(meta.ip),
    location: place.length ? Array.from(new Set(place)).join(", ") : "",
    device,
    browser: [text(meta.browser), text(meta.os)].filter(Boolean).join(" · "),
    page: text(meta.url),
    referrer: text(meta.referrer),
    language: text(meta.language) || text(meta.accept_language),
    timezone: text(meta.timezone) || text(meta.ip_timezone),
    screen: text(meta.screen),
  };
}

function DeviceIcon({ device, size = 13 }: { device: string; size?: number }) {
  if (device === "mobile") return <Smartphone size={size} />;
  if (device === "tablet") return <Tablet size={size} />;
  return <Monitor size={size} />;
}

const answerFor = (answer: AnswerRecord) => answer.answer_text || formatAnswer(answer.value);
const questionFor = (answer: AnswerRecord) => answer.question || humanize(answer.variable_name);

const statusOptions = [{ value: "active", label: "Active" }, { value: "completed", label: "Completed" }, { value: "qualified", label: "Qualified" }, { value: "spam", label: "Spam" }, { value: "archived", label: "Archived" }];

export default function ResponsesPage() {
  const { botId } = useParams<{ botId: string }>();
  const router = useRouter();
  const [items, setItems] = useState<ConversationRecord[]>([]);
  const [selected, setSelected] = useState<ConversationRecord | null>(null);
  const [transcript, setTranscript] = useState<ConversationRecord | null>(null);
  const transcriptDialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagsText, setTagsText] = useState("");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ViewMode>("list");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "table" || saved === "list") setView(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const chooseView = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* storage unavailable */
    }
  };

  // Full search: the response number, session, source, tags, every answer, every collected variable and the visitor details.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!needle) return true;
      const visitor = visitorOf(item);
      const haystack = [
        `#${item.response_number}`,
        String(item.response_number),
        item.session_id,
        item.source,
        item.status,
        item.tags.join(" "),
        JSON.stringify(item.variables),
        ...item.answers.flatMap((answer) => [questionFor(answer), answerFor(answer)]),
        ...item.notes.map((entry) => String(entry.text ?? "")),
        visitor.ip,
        visitor.location,
        visitor.device,
        visitor.browser,
        visitor.page,
        visitor.referrer,
        new Date(item.started_at).toLocaleString(),
      ].join(" \n ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, query, statusFilter]);

  // Ten responses per page; a new search or filter starts again from the first page.
  useEffect(() => { setPage(1); }, [query, statusFilter, view]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastShown = Math.min(filtered.length, currentPage * PAGE_SIZE);

  // Table columns: one per distinct question, in the order visitors first met them.
  const questionColumns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of filtered) {
      for (const answer of item.answers) {
        const key = answer.node_id || answer.variable_name;
        if (!seen.has(key)) seen.set(key, questionFor(answer));
      }
    }
    return Array.from(seen, ([key, label]) => ({ key, label }));
  }, [filtered]);

  useEffect(() => {
    listResponses(botId).then(setItems).catch((caught) => {
      if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login");
      else setError(caught instanceof Error ? caught.message : "Could not load responses");
    });
  }, [botId, router]);

  useEffect(() => {
    const dialog = transcriptDialog.current;
    if (!dialog) return;
    if (transcript && !dialog.open) dialog.showModal();
    if (!transcript && dialog.open) dialog.close();
  }, [transcript]);

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

  const visitorChips = (item: ConversationRecord) => {
    const visitor = visitorOf(item);
    const chips: Array<{ key: string; icon: ReactNode; label: string; title: string }> = [];
    if (visitor.ip) chips.push({ key: "ip", icon: <Globe size={12} />, label: visitor.ip, title: "Visitor IP address" });
    if (visitor.location) chips.push({ key: "location", icon: <MapPin size={12} />, label: visitor.location, title: "Location (from the IP address)" });
    if (visitor.device || visitor.browser) chips.push({ key: "device", icon: <DeviceIcon device={visitor.device} size={12} />, label: [visitor.device && humanize(visitor.device), visitor.browser].filter(Boolean).join(" · "), title: "Device and browser" });
    return chips;
  };

  const pagination = filtered.length > PAGE_SIZE ? (
    <nav className="response-pagination" aria-label="Response pages">
      <button type="button" className="secondary-button compact-action" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /> Previous</button>
      <span>Showing {firstShown}–{lastShown} of {filtered.length} · page {currentPage} of {pageCount}</span>
      <button type="button" className="secondary-button compact-action" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next <ChevronRight size={14} /></button>
    </nav>
  ) : null;
  const empty = <div className="empty-dashboard"><Inbox size={26} /><h2>No matching responses</h2><p>Run a published chatbot or change the current filters.</p></div>;

  return (
    <main className="responses-page">
      <header className="responses-header">
        <Link className="icon-button" href={`/bots/${botId}/builder`}><ChevronLeft size={18} /></Link>
        <div><p className="eyebrow">Responses</p><h1>Conversation activity</h1></div>
        <div className="response-export-actions">{(["csv", "json", "xlsx"] as const).map((format) => <button className="secondary-button" type="button" key={format} onClick={() => void downloadResponses(botId, format).catch((caught) => setError(caught instanceof Error ? caught.message : "Export failed"))}><Download size={14} /> {format.toUpperCase()}</button>)}</div>
      </header>
      {error ? <div className="form-error">{error}</div> : null}
      <section className="response-toolbar">
        <label><Search size={15} /><input placeholder="Search answers, visitors, tags, response numbers…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <Select ariaLabel="Filter by status" value={statusFilter} options={[{ value: "all", label: "All statuses" }, ...statusOptions]} onChange={setStatusFilter} />
        <span>{filtered.length} responses</span>
        <div className="response-view-toggle" role="group" aria-label="View">
          <button type="button" className={view === "list" ? "is-active" : ""} aria-pressed={view === "list"} title="List" onClick={() => chooseView("list")}><LayoutList size={15} /> List</button>
          <button type="button" className={view === "table" ? "is-active" : ""} aria-pressed={view === "table"} title="Table" onClick={() => chooseView("table")}><Table2 size={15} /> Table</button>
        </div>
      </section>

      {view === "table" ? (
        <section className="response-table-wrap">
          {filtered.length === 0 ? empty : (
            <div className="response-table-scroll">
              <table className="response-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Started</th>
                    <th>Status</th>
                    <th>Visitor</th>
                    <th>Location</th>
                    <th>Device</th>
                    {questionColumns.map((column) => <th key={column.key} title={column.label}>{column.label}</th>)}
                    <th>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => {
                    const visitor = visitorOf(item);
                    const byQuestion = new Map(item.answers.map((answer) => [answer.node_id || answer.variable_name, answerFor(answer)]));
                    return (
                      <tr key={item.id} className={selected?.id === item.id ? "is-selected" : ""} onClick={() => choose(item)}>
                        <td><button type="button" className="response-number-button" title="Open as a chat" onClick={(event) => { event.stopPropagation(); choose(item); setTranscript(item); }}><MessagesSquare size={13} /> #{item.response_number}</button></td>
                        <td className="response-cell-muted">{new Date(item.started_at).toLocaleString()}</td>
                        <td><span className={`status-pill status-${item.status}`}>{item.status}</span></td>
                        <td className="response-cell-mono">{visitor.ip || "—"}</td>
                        <td>{visitor.location || "—"}</td>
                        <td>{visitor.device || visitor.browser ? <span className="response-device"><DeviceIcon device={visitor.device} /> {[visitor.device && humanize(visitor.device), visitor.browser].filter(Boolean).join(" · ")}</span> : "—"}</td>
                        {questionColumns.map((column) => <td key={column.key} title={byQuestion.get(column.key) ?? ""}>{byQuestion.get(column.key) ?? "—"}</td>)}
                        <td className="response-cell-muted">{item.tags.join(", ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pagination}
        </section>
      ) : null}

      <div className={`responses-layout${view === "table" ? " is-table-detail" : ""}`}>
        {view === "list" ? (
          <section className="response-list">
            {filtered.length === 0 ? empty : pageItems.map((item) => {
              const visitor = visitorOf(item);
              return (
                <div className={selected?.id === item.id ? "response-row selected" : "response-row"} key={item.id} role="button" tabIndex={0} onClick={() => choose(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(item); } }}>
                  <span className={`status-pill status-${item.status}`}>{item.status}</span>
                  <button type="button" className="response-number-button" title="Open as a chat" onClick={(event) => { event.stopPropagation(); choose(item); setTranscript(item); }}><MessagesSquare size={13} /> Response #{item.response_number}</button>
                  <small>{new Date(item.started_at).toLocaleString()}</small>
                  <span>{item.answers.length} {item.answers.length === 1 ? "answer" : "answers"} · {item.source}{visitor.ip ? ` · ${visitor.ip}` : ""}{visitor.location ? ` · ${visitor.location}` : ""}{item.tags.length ? ` · ${item.tags.join(", ")}` : ""}</span>
                </div>
              );
            })}
            {pagination}
          </section>
        ) : null}
        <aside className="response-detail">
          {selected ? (
            <>
              <div className="response-detail-heading">
                <div>
                  <h2><button type="button" className="response-number-button is-heading" title="Open as a chat" onClick={() => setTranscript(selected)}><MessagesSquare size={15} /> Response #{selected.response_number}</button></h2>
                  <small>{new Date(selected.started_at).toLocaleString()} · {selected.source}</small>
                </div>
                <Select size="sm" ariaLabel="Response status" value={selected.status} options={statusOptions} onChange={(status) => void updateConversation(selected.id, { status }).then(replace)} />
              </div>
              {visitorChips(selected).length ? (
                <div className="response-visitor" aria-label="Visitor details">
                  {visitorChips(selected).map((chip) => <span key={chip.key} title={chip.title}>{chip.icon} {chip.label}</span>)}
                </div>
              ) : null}
              {selected.answers.length ? (
                <ol className="response-answers">
                  {selected.answers.map((answer, index) => (
                    <li key={answer.id}>
                      <span className="response-answer-index">{index + 1}</span>
                      <div>
                        <p className="response-question">{questionFor(answer)}</p>
                        <p className="response-answer">{answerFor(answer)}</p>
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
                <summary>Visitor details, variables and metadata</summary>
                {(() => {
                  const visitor = visitorOf(selected);
                  const rows = ([
                    ["IP address", visitor.ip],
                    ["Location", visitor.location],
                    ["Device", visitor.device ? humanize(visitor.device) : ""],
                    ["Browser", visitor.browser],
                    ["Page", visitor.page],
                    ["Came from", visitor.referrer],
                    ["Language", visitor.language],
                    ["Time zone", visitor.timezone],
                    ["Screen", visitor.screen],
                    ["Session", selected.session_id],
                  ] as Array<[string, string]>).filter((row) => Boolean(row[1]));
                  return rows.length ? <dl className="response-visitor-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null;
                })()}
                <pre>{JSON.stringify({ session_id: selected.session_id, variables: selected.variables, metadata: selected.metadata }, null, 2)}</pre>
              </details>
            </>
          ) : <div className="empty-properties"><strong>Select a response</strong><p>The visitor's answers, question by question, appear here.</p></div>}
        </aside>
      </div>

      <dialog ref={transcriptDialog} className="app-dialog response-chat-dialog" aria-label={transcript ? `Response #${transcript.response_number} as a chat` : "Chat"} onClose={() => setTranscript(null)} onClick={(event) => { if (event.target === event.currentTarget) setTranscript(null); }}>
        {transcript ? (
          <div className="response-chat">
            <header className="response-chat-head">
              <div>
                <strong>Response #{transcript.response_number}</strong>
                <small>{new Date(transcript.started_at).toLocaleString()} · {transcript.source}{visitorOf(transcript).ip ? ` · ${visitorOf(transcript).ip}` : ""}{visitorOf(transcript).location ? ` · ${visitorOf(transcript).location}` : ""}</small>
              </div>
              <button type="button" className="icon-button" aria-label="Close" onClick={() => setTranscript(null)}><X size={16} /></button>
            </header>
            <div className="response-chat-body">
              {transcript.answers.length ? transcript.answers.map((answer) => (
                <div className="response-chat-turn" key={answer.id}>
                  <div className="response-chat-bubble is-bot">{questionFor(answer)}</div>
                  <div className="response-chat-bubble is-visitor">{answerFor(answer)}</div>
                  <time className="response-chat-time">{new Date(answer.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
              )) : <p className="response-empty-answers">The visitor opened the chat but did not answer a question.</p>}
            </div>
          </div>
        ) : null}
      </dialog>
    </main>
  );
}
