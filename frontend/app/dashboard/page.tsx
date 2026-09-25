"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Archive, Blocks, ListTree, LogOut, Pencil, Plus, Sparkles, X } from "lucide-react";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";
import { archiveBot, createBot, listBots, updateBot } from "@/services/bots";
import { currentUser, logout } from "@/services/auth";
import type { BotRecord, User } from "@/types/api";

export default function DashboardPage() {
  const router = useRouter();
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const [profile, records] = await Promise.all([currentUser(), listBots()]);
      setUser(profile);
      setBots(records);
    } catch {
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const bot = await createBot(name, description);
      setShowCreate(false);
      router.push(`/bots/${bot.id}/builder`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create bot");
    }
  };

  const rename = async (bot: BotRecord) => {
    const nextName = window.prompt("Bot name", bot.name)?.trim();
    if (!nextName || nextName === bot.name) return;
    const updated = await updateBot(bot.id, { name: nextName });
    setBots((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  };

  const archive = async (bot: BotRecord) => {
    if (!window.confirm(`Archive “${bot.name}”?`)) return;
    await archiveBot(bot.id);
    setBots((items) => items.filter((item) => item.id !== bot.id));
  };

  if (loading) return <main className="centered-page">Loading your bots…</main>;

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="brand-mark"><SpaghettiMark size={44} /></div>
        <div>
          <p className="eyebrow">Spaghetti</p>
          <h1>Your bots</h1>
          <p className="welcome-copy">Welcome, {user?.name}</p>
        </div>
        <div className="dashboard-actions">
          <Link className="secondary-button" href="/subflows"><Blocks size={16} /> Components</Link>
          <Link className="secondary-button" href="/logic"><ListTree size={16} /> Rules</Link>
          <button className="secondary-button" type="button" onClick={() => { logout(); router.push("/login"); }}>
            <LogOut size={16} /> Sign out
          </button>
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
            <Plus size={17} /> New bot
          </button>
        </div>
      </header>

      {showCreate ? (
        <form className="create-bot-card" onSubmit={handleCreate}>
          <button className="close-button" type="button" aria-label="Close" onClick={() => setShowCreate(false)}><X size={17} /></button>
          <h2>Create a bot</h2>
          <label>Name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit">Create and open</button>
        </form>
      ) : null}

      <section className="dashboard-grid" aria-label="Bots">
        {bots.length === 0 ? (
          <div className="empty-dashboard"><Sparkles size={28} /><h2>Create your first bot</h2><p>Build a readable conversation flow visually.</p></div>
        ) : bots.map((bot) => (
          <article className="bot-card" key={bot.id}>
            <Link className="bot-card-main" href={`/bots/${bot.id}/builder`}>
              <div className="bot-card-icon"><Sparkles size={24} /></div>
              <div>
                <div className="card-title-row"><h2>{bot.name}</h2><span className="status-pill">{bot.status}</span></div>
                <p>{bot.description || "Visual conversation flow"}</p>
              </div>
              <span className="open-label">Open builder →</span>
            </Link>
            <div className="bot-card-actions">
              <button type="button" onClick={() => void rename(bot)}><Pencil size={14} /> Rename</button>
              <button type="button" onClick={() => void archive(bot)}><Archive size={14} /> Archive</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
