"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Bot, ClipboardList, LayoutDashboard, LogOut, Send, Users } from "lucide-react";
import { AuditSection } from "@/components/AuditSection";
import { BotsSection } from "@/components/BotsSection";
import { DeliveriesSection } from "@/components/DeliveriesSection";
import { OverviewSection } from "@/components/OverviewSection";
import { UsersSection } from "@/components/UsersSection";
import { currentUser, logout } from "@/lib/admin";
import { ApiError, getToken } from "@/lib/api";
import type { SessionUser } from "@/lib/types";

type Section = "overview" | "users" | "bots" | "deliveries" | "audit";

const SECTIONS: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "users", label: "Accounts", icon: Users },
  { key: "bots", label: "Bots", icon: Bot },
  { key: "deliveries", label: "Deliveries", icon: Send },
  { key: "audit", label: "Audit log", icon: ClipboardList },
];

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function ConsolePage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<SessionUser | null>(null);
  const [section, setSection] = useState<Section>("overview");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    currentUser()
      .then((user) => {
        if (user.role !== "superadmin") throw new ApiError("Not an admin", 403);
        setAdmin(user);
      })
      .catch(() => {
        logout();
        router.replace("/");
      });
  }, [router]);

  if (!admin) return <main className="centered-page">Checking your session…</main>;

  return (
    <div className="console-shell">
      <aside className="console-nav">
        <div className="console-brand">
          <Activity size={18} />
          <div>
            <strong>Spaghetti</strong>
            <small>Admin console</small>
          </div>
        </div>
        <nav aria-label="Console sections">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className={section === key ? "is-active" : ""} onClick={() => setSection(key)}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
        <div className="console-nav-footer">
          <a className="secondary-button" href={siteUrl} target="_blank" rel="noreferrer">Open builder app</a>
          <div className="console-user">
            <strong>{admin.name}</strong>
            <small>{admin.email}</small>
          </div>
          <button className="secondary-button" type="button" onClick={() => { logout(); router.push("/"); }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <main className="console-main">
        {section === "overview" ? <OverviewSection /> : null}
        {section === "users" ? <UsersSection adminId={admin.id} /> : null}
        {section === "bots" ? <BotsSection /> : null}
        {section === "deliveries" ? <DeliveriesSection /> : null}
        {section === "audit" ? <AuditSection /> : null}
      </main>
    </div>
  );
}
