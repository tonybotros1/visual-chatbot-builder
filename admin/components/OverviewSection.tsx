"use client";

import { useEffect, useState } from "react";
import { getOverview } from "@/lib/admin";
import type { Overview } from "@/lib/types";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export function OverviewSection() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getOverview().then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load overview"));
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const tiles: { label: string; value: number; hint?: string; tone?: "warn" | "bad" }[] = [
    { label: "Accounts", value: data.users_total, hint: `${data.users_active} active` },
    { label: "Bots", value: data.bots_total, hint: `${data.bots_published} published · ${data.bots_archived} archived` },
    { label: "Conversations", value: data.conversations_total, hint: `${data.conversations_last_7_days} in the last 7 days` },
    { label: "Completed", value: data.conversations_completed, hint: data.conversations_total ? `${Math.round((data.conversations_completed / data.conversations_total) * 100)}% completion` : undefined },
    { label: "Active deployments", value: data.deployments_active },
    { label: "Pending deliveries", value: data.deliveries_pending, tone: data.deliveries_pending ? "warn" : undefined },
    { label: "Failed deliveries", value: data.deliveries_failed, tone: data.deliveries_failed ? "bad" : undefined },
    { label: "Reusable assets", value: data.subflows_total + data.logic_assets_total, hint: `${data.subflows_total} components · ${data.logic_assets_total} rule sets` },
  ];

  return (
    <section>
      <header className="section-header">
        <p className="eyebrow">Platform</p>
        <h1>Overview</h1>
      </header>
      <div className="tile-grid">
        {tiles.map((tile) => (
          <article key={tile.label} className={`tile${tile.tone ? ` tile-${tile.tone}` : ""}`}>
            <span className="tile-label">{tile.label}</span>
            <strong className="tile-value">{tile.value.toLocaleString()}</strong>
            {tile.hint ? <small>{tile.hint}</small> : null}
          </article>
        ))}
      </div>
      <div className="card">
        <h2>Environment</h2>
        <dl className="kv">
          <dt>Builder app</dt><dd><a href={siteUrl} target="_blank" rel="noreferrer">{siteUrl}</a></dd>
          <dt>API</dt><dd><a href={`${apiUrl.replace(/\/api$/, "")}/docs`} target="_blank" rel="noreferrer">{apiUrl}</a></dd>
        </dl>
      </div>
    </section>
  );
}
