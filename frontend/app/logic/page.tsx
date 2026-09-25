"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, GitCompareArrows, ListTree, Plus, Sparkles, X } from "lucide-react";
import { createLogicAsset, listLogicAssets } from "@/services/logic";
import type { LogicAssetRecord, LogicKind } from "@/types/api";


export default function LogicLibraryPage() {
  const router = useRouter();
  const [items, setItems] = useState<LogicAssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [kind, setKind] = useState<LogicKind>("rule_set");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listLogicAssets()
      .then(setItems)
      .catch((caught) => {
        if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login");
        else setError(caught instanceof Error ? caught.message : "Could not load reusable logic");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const asset = await createLogicAsset(kind, name, description);
      router.push(`/logic/${asset.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create logic asset");
    }
  };

  if (loading) return <main className="centered-page">Loading reusable logic…</main>;

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="brand-mark"><ListTree size={22} /></div>
        <div><p className="eyebrow">V2 knowledge layer</p><h1>Rules and decisions</h1><p className="welcome-copy">Typed, versioned logic shared across bots.</p></div>
        <div className="dashboard-actions">
          <Link className="secondary-button" href="/dashboard"><ChevronLeft size={16} /> Bots</Link>
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}><Plus size={17} /> New logic</button>
        </div>
      </header>
      {showCreate ? (
        <form className="create-bot-card" onSubmit={create}>
          <button className="close-button" type="button" aria-label="Close" onClick={() => setShowCreate(false)}><X size={17} /></button>
          <h2>Create reusable logic</h2>
          <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as LogicKind)}><option value="rule_set">Rule set</option><option value="decision_table">Decision table</option></select></label>
          <label>Name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit">Create draft</button>
        </form>
      ) : error ? <div className="form-error component-error">{error}</div> : null}
      <section className="dashboard-grid" aria-label="Logic assets">
        {items.length === 0 ? <div className="empty-dashboard"><Sparkles size={28} /><h2>Create your first rule set</h2><p>Centralize business logic and pin immutable versions in flows.</p></div> : items.map((item) => {
          const Icon = item.kind === "rule_set" ? ListTree : GitCompareArrows;
          return (
            <article className="bot-card" key={item.id}>
              <Link className="bot-card-main" href={`/logic/${item.id}`}>
                <div className="bot-card-icon"><Icon size={24} /></div>
                <div><div className="card-title-row"><h2>{item.name}</h2><span className="status-pill">{item.status}</span></div><p>{item.description || (item.kind === "rule_set" ? "Reusable rule set" : "Decision table")}</p></div>
                <span className="open-label">Open definition →</span>
              </Link>
            </article>
          );
        })}
      </section>
    </main>
  );
}
