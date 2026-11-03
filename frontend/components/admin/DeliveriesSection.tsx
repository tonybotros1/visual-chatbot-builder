"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { listDeliveries, retryDelivery } from "@/services/admin";
import type { Delivery } from "@/types/admin";

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
        <Select ariaLabel="Filter by status" value={status} options={[{ value: "", label: "All statuses" }, { value: "pending", label: "Pending" }, { value: "delivered", label: "Delivered" }, { value: "failed", label: "Failed" }]} onChange={(value) => { setStatus(value); void refresh(value); }} />
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
