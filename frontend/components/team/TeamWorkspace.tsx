"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, History, Plus, Shield, Trash2, UserRound } from "lucide-react";
import { getBot } from "@/services/bots";
import { inviteCollaborator, listAuditLog, listCollaborators, removeCollaborator, updateCollaborator } from "@/services/team";
import type { AuditLogRecord, BotCollaborator } from "@/types/api";


export function TeamWorkspace({ botId }: { botId: string }) {
  const router = useRouter();
  const [botName, setBotName] = useState("Team access");
  const [members, setMembers] = useState<BotCollaborator[]>([]);
  const [audit, setAudit] = useState<AuditLogRecord[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { const [bot, memberItems, auditItems] = await Promise.all([getBot(botId), listCollaborators(botId), listAuditLog(botId)]); setBotName(bot.name); setMembers(memberItems); setAudit(auditItems); }
    catch (caught) { if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login"); else setError(caught instanceof Error ? caught.message : "Could not load team access"); }
  }, [botId, router]);
  useEffect(() => { void load(); }, [load]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    try { const item = await inviteCollaborator(botId, email, role); setMembers((items) => [...items.filter((value) => value.user_id !== item.user_id), item]); setEmail(""); const logs = await listAuditLog(botId); setAudit(logs); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not add teammate"); }
  };

  const replace = (updated: BotCollaborator) => setMembers((items) => items.map((item) => item.user_id === updated.user_id ? updated : item));

  return <main className="team-page">
    <header className="team-header"><div className="builder-brand"><Link className="icon-button" href={`/bots/${botId}/builder`}><ChevronLeft size={19} /></Link><div><strong>{botName}</strong><span>Role-based collaboration and audit history</span></div></div></header>
    {error ? <div className="form-error">{error}</div> : null}
    <div className="team-grid">
      <section className="team-card">
        <div><p className="eyebrow">Access control</p><h2>Collaborators</h2></div>
        <form className="invite-form" onSubmit={invite}><input type="email" required placeholder="teammate@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /><select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select><button className="primary-button" type="submit"><Plus size={14} /> Add</button></form>
        <p className="team-help"><Shield size={13} /> Viewers can inspect. Editors can build, test, publish, deploy, and operate responses. Admins also manage access and integrations.</p>
        <div className="member-list">{members.map((member) => <article key={member.user_id}><UserRound size={16} /><div><strong>{member.name}</strong><small>{member.email}</small></div>{member.owner ? <span className="status-pill">Owner</span> : <select value={member.role} onChange={(event) => member.id && void updateCollaborator(botId, member.id, event.target.value as "admin" | "editor" | "viewer").then(replace)}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select>}{!member.owner && member.id ? <button type="button" aria-label={`Remove ${member.name}`} onClick={() => void removeCollaborator(botId, member.id!).then(() => setMembers((items) => items.filter((item) => item.id !== member.id)))}><Trash2 size={14} /></button> : null}</article>)}</div>
      </section>
      <section className="team-card">
        <div><p className="eyebrow">Accountability</p><h2>Audit log</h2></div>
        <div className="audit-list">{audit.length ? audit.map((entry) => <article key={entry.id}><History size={14} /><div><strong>{entry.action}</strong><span>{entry.entity_type}{entry.entity_id ? ` · ${entry.entity_id}` : ""}</span><small>{new Date(entry.created_at).toLocaleString()}</small></div></article>) : <p className="contract-empty">Team administration changes appear here.</p>}</div>
      </section>
    </div>
  </main>;
}
