"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Blocks, Bot, ChevronLeft, Plus, Sparkles, X } from "lucide-react";
import { createSubflow, listSubflows } from "@/services/subflows";
import type { SubflowRecord } from "@/types/api";


export default function SubflowsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SubflowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listSubflows()
      .then(setItems)
      .catch((caught) => {
        if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login");
        else setError(caught instanceof Error ? caught.message : "Could not load components");
      })
      .finally(() => setLoading(false));
  }, [router]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const subflow = await createSubflow(name, description);
      router.push(`/subflows/${subflow.id}/builder`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create component");
    }
  };

  if (loading) return <main className="centered-page">Loading reusable components…</main>;

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="brand-mark"><Blocks size={22} /></div>
        <div>
          <p className="eyebrow">V2 component library</p>
          <h1>Reusable subflows</h1>
          <p className="welcome-copy">Typed, versioned modules shared across bots.</p>
        </div>
        <div className="dashboard-actions">
          <Link className="secondary-button" href="/dashboard"><ChevronLeft size={16} /> Bots</Link>
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}><Plus size={17} /> New component</button>
        </div>
      </header>

      {showCreate ? (
        <form className="create-bot-card" onSubmit={create}>
          <button className="close-button" type="button" aria-label="Close" onClick={() => setShowCreate(false)}><X size={17} /></button>
          <h2>Create a reusable component</h2>
          <label>Name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit">Create and define contract</button>
        </form>
      ) : error ? <div className="form-error component-error">{error}</div> : null}

      <section className="dashboard-grid" aria-label="Reusable components">
        {items.length === 0 ? (
          <div className="empty-dashboard"><Sparkles size={28} /><h2>Create your first component</h2><p>Extract a stable module and publish its typed interface.</p></div>
        ) : items.map((item) => (
          <article className="bot-card" key={item.id}>
            <Link className="bot-card-main" href={`/subflows/${item.id}/builder`}>
              <div className="bot-card-icon"><Bot size={24} /></div>
              <div>
                <div className="card-title-row"><h2>{item.name}</h2><span className="status-pill">{item.status}</span></div>
                <p>{item.description || "Reusable typed subflow"}</p>
              </div>
              <span className="open-label">Open definition →</span>
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
