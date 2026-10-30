"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, ArrowRightLeft, ExternalLink, RotateCcw, Search } from "lucide-react";
import { listBots, listUsers, updateBot } from "@/lib/admin";
import type { AdminBot, AdminUser } from "@/lib/types";
import { useConfirm } from "@/components/useConfirm";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function BotsSection() {
  const [bots, setBots] = useState<AdminBot[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { confirm, dialog } = useConfirm();

  const refresh = useCallback(async (q = query, s = status) => {
    try {
      setBots(await listBots(q, s));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load bots");
    }
  }, [query, status]);

  useEffect(() => {
    void refresh();
    listUsers().then(setUsers).catch(() => undefined);
  }, [refresh]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    }
  };

  const transfer = async (bot: AdminBot) => {
    const options = users.filter((user) => user.id !== bot.owner_id).map((user) => ({ value: user.id, label: `${user.name} (${user.email})` }));
    if (options.length === 0) {
      setError("There is no other account to transfer this bot to.");
      return;
    }
    const ownerId = await confirm({
      title: `Transfer “${bot.name}”`,
      message: `Currently owned by ${bot.owner_email}.`,
      select: { label: "New owner", options },
      confirmLabel: "Transfer",
    });
    if (typeof ownerId !== "string") return;
    await run(() => updateBot(bot.id, { owner_id: ownerId }), `Transferred “${bot.name}”`);
  };

  const archive = async (bot: AdminBot) => {
    const ok = await confirm({ title: `Archive “${bot.name}”?`, message: "It disappears from the owner's dashboard and stops starting new conversations.", confirmLabel: "Archive", danger: true });
    if (!ok) return;
    await run(() => updateBot(bot.id, { status: "archived" }), `Archived “${bot.name}”`);
  };

  const restore = (bot: AdminBot) => run(() => updateBot(bot.id, { status: bot.published_version ? "published" : "draft" }), `Restored “${bot.name}”`);

  return (
    <section>
      <header className="section-header">
        <div>
          <p className="eyebrow">Bots</p>
          <h1>All bots</h1>
        </div>
      </header>
      <div className="toolbar">
        <label className="search">
          <Search size={15} />
          <input placeholder="Search by name or slug" value={query} onChange={(event) => { setQuery(event.target.value); void refresh(event.target.value, status); }} />
        </label>
        <select value={status} onChange={(event) => { setStatus(event.target.value); void refresh(query, event.target.value); }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <span className="muted">{bots.length} bot{bots.length === 1 ? "" : "s"}</span>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-notice" role="status">{notice}</p> : null}
      <div className="card table-card">
        <table>
          <thead>
            <tr><th>Bot</th><th>Owner</th><th>Status</th><th>Conversations</th><th>Deployments</th><th>Updated</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {bots.map((bot) => (
              <tr key={bot.id} className={bot.status === "archived" ? "is-muted" : ""}>
                <td><strong>{bot.name}</strong><br /><small>{bot.slug}{bot.published_version ? ` · v${bot.published_version}` : ""}</small></td>
                <td>{bot.owner_name}<br /><small>{bot.owner_email}</small></td>
                <td><span className={`pill pill-${bot.status}`}>{bot.status}</span></td>
                <td>{bot.conversation_count}</td>
                <td>{bot.deployment_count}</td>
                <td>{new Date(bot.updated_at).toLocaleDateString()}</td>
                <td className="row-actions">
                  {bot.status === "published" ? <a className="icon-button" title="Open public chat" href={`${siteUrl}/chat/${bot.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a> : null}
                  <button type="button" className="icon-button" title="Transfer to another account" onClick={() => void transfer(bot)}><ArrowRightLeft size={15} /></button>
                  {bot.status === "archived"
                    ? <button type="button" className="icon-button" title="Restore" onClick={() => void restore(bot)}><RotateCcw size={15} /></button>
                    : <button type="button" className="icon-button icon-button-danger" title="Archive" onClick={() => void archive(bot)}><Archive size={15} /></button>}
                </td>
              </tr>
            ))}
            {bots.length === 0 ? <tr><td colSpan={7} className="muted">No bots match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {dialog}
    </section>
  );
}
