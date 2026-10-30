"use client";

import { useEffect, useState } from "react";
import { listAudit } from "@/lib/admin";
import type { AuditEntry } from "@/lib/types";

export function AuditSection() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    listAudit(200).then(setItems).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load audit log"));
  }, []);

  return (
    <section>
      <header className="section-header">
        <div>
          <p className="eyebrow">Accountability</p>
          <h1>Audit log</h1>
        </div>
      </header>
      <p className="muted">The latest 200 recorded actions across every bot.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="card table-card">
        <table>
          <thead>
            <tr><th>When</th><th>Who</th><th>Action</th><th>Bot</th><th>Details</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><small>{new Date(item.created_at).toLocaleString()}</small></td>
                <td>{item.user_email ?? "system"}</td>
                <td><code>{item.action}</code><br /><small>{item.entity_type}{item.entity_id ? ` · ${item.entity_id.slice(0, 8)}` : ""}</small></td>
                <td>{item.bot_name ?? "—"}</td>
                <td className="details-cell"><small>{Object.keys(item.details).length ? JSON.stringify(item.details) : "—"}</small></td>
              </tr>
            ))}
            {items.length === 0 ? <tr><td colSpan={5} className="muted">Nothing recorded yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
