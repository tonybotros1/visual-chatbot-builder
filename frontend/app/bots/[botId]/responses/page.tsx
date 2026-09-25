"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Download, Inbox, Save, Search, Tag } from "lucide-react";
import { downloadResponses, listResponses, updateConversation } from "@/services/conversations";
import type { ConversationRecord } from "@/types/api";

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

  const filtered = useMemo(() => items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    const haystack = `${item.session_id} ${item.source} ${item.tags.join(" ")} ${JSON.stringify(item.variables)}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }), [items, query, statusFilter]);

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
      <section className="response-toolbar"><label><Search size={15} /><input placeholder="Search sessions, answers, tags…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="completed">Completed</option><option value="qualified">Qualified</option><option value="spam">Spam</option><option value="archived">Archived</option></select><span>{filtered.length} responses</span></section>
      <div className="responses-layout">
        <section className="response-list">
          {filtered.length === 0 ? <div className="empty-dashboard"><Inbox size={26} /><h2>No matching responses</h2><p>Run a published chatbot or change the current filters.</p></div> : filtered.map((item) => (
            <button type="button" className={selected?.id === item.id ? "response-row selected" : "response-row"} key={item.id} onClick={() => choose(item)}>
              <span className={`status-pill status-${item.status}`}>{item.status}</span>
              <strong>{item.session_id.slice(0, 12)}</strong>
              <small>{new Date(item.started_at).toLocaleString()}</small>
              <span>{item.answers.length} answers · {item.source}{item.tags.length ? ` · ${item.tags.join(", ")}` : ""}</span>
            </button>
          ))}
        </section>
        <aside className="response-detail">
          {selected ? <><div className="response-detail-heading"><h2>Conversation detail</h2><select aria-label="Response status" value={selected.status} onChange={(event) => void updateConversation(selected.id, { status: event.target.value }).then(replace)}><option value="active">Active</option><option value="completed">Completed</option><option value="qualified">Qualified</option><option value="spam">Spam</option><option value="archived">Archived</option></select></div><dl>{selected.answers.map((answer) => <div key={answer.id}><dt>{answer.variable_name}</dt><dd>{JSON.stringify(answer.value)}</dd></div>)}</dl><section className="response-operations"><label><Tag size={14} /> Tags<input value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="lead, priority, follow-up" /></label><label>Internal note<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note for your team…" /></label><button className="primary-button" type="button" onClick={() => void saveOperations()}><Save size={14} /> Save operations</button>{selected.notes.length ? <div className="response-notes">{selected.notes.map((entry, index) => <article key={`${entry.created_at}-${index}`}><p>{entry.text}</p><small>{new Date(entry.created_at).toLocaleString()}</small></article>)}</div> : null}</section><h3>Variables and metadata</h3><pre>{JSON.stringify({ variables: selected.variables, metadata: selected.metadata }, null, 2)}</pre></> : <div className="empty-properties"><strong>Select a conversation</strong><p>Captured answers and workflow controls appear here.</p></div>}
        </aside>
      </div>
    </main>
  );
}
