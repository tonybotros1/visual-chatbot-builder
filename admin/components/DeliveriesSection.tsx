"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { listDeliveries, retryDelivery } from "@/lib/admin";
import type { Delivery } from "@/lib/types";

export function DeliveriesSection() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async (s = status) => {
    try {
      setItems(await listDeliveries(s));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load deliveries");
    }
  }, [status]);

  useEffect(() => { void refresh(); }, [refresh]);

  const retry = async (item: Delivery) => {
    setError("");
    try {
      await retryDelivery(item.id);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retry failed");
    }
  };

  return (
    <section>
      <header className="section-header">
        <div>
          <p className="eyebrow">Integrations</p>
          <h1>Notification deliveries</h1>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</button>
      </header>
      <p className="muted">Emails, webhooks, Slack and SMS messages queued by conversations. Failed items can be re-queued for the worker.</p>
      <div className="toolbar">
        <select value={status} onChange={(event) => { setStatus(event.target.value); void refresh(event.target.value); }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
        </select>
        <span className="muted">{items.length} shown</span>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="card table-card">
        <table>
          <thead>
            <tr><th>When</th><th>Bot</th><th>Channel</th><th>Event</th><th>Status</th><th>Attempts</th><th>Last error</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><small>{new Date(item.created_at).toLocaleString()}</small></td>
                <td>{item.bot_name ?? "—"}</td>
                <td>{item.connection_name ?? "—"}<br /><small>{item.provider ?? ""}</small></td>
                <td>{item.event}</td>
                <td><span className={`pill pill-${item.status}`}>{item.status}</span></td>
                <td>{item.attempt_count}</td>
                <td className="error-cell"><small>{item.last_error || "—"}</small></td>
                <td className="row-actions">{item.status !== "delivered" ? <button type="button" className="icon-button" title="Retry now" onClick={() => void retry(item)}><RotateCcw size={15} /></button> : null}</td>
              </tr>
            ))}
            {items.length === 0 ? <tr><td colSpan={8} className="muted">No deliveries yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
