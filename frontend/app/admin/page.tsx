"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Bot, ClipboardList, KeyRound, LayoutDashboard, LogOut, Palette, Send, ShieldCheck, Users } from "lucide-react";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";
import { AccessSection } from "@/components/admin/AccessSection";
import { AuditSection } from "@/components/admin/AuditSection";
import { BotsSection } from "@/components/admin/BotsSection";
import { BrandingSection } from "@/components/admin/BrandingSection";
import { DeliveriesSection } from "@/components/admin/DeliveriesSection";
import { OverviewSection } from "@/components/admin/OverviewSection";
import { UsersSection } from "@/components/admin/UsersSection";
import { currentUser, logout } from "@/services/auth";
import type { User } from "@/types/api";

type Section = "overview" | "users" | "bots" | "access" | "deliveries" | "audit" | "branding";

const SECTIONS: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "users", label: "Accounts", icon: Users },
  { key: "bots", label: "Bots", icon: Bot },
  { key: "access", label: "Access", icon: KeyRound },
  { key: "deliveries", label: "Deliveries", icon: Send },
  { key: "audit", label: "Audit log", icon: ClipboardList },
  { key: "branding", label: "Branding", icon: Palette },
];

const isSection = (value: string): value is Section => SECTIONS.some((item) => item.key === value);

/** Platform administration inside the builder: reachable from the gear icon on the dashboard (admins only). */
export default function AdminConsolePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "forbidden">("loading");
  const [section, setSection] = useState<Section>("overview");

  useEffect(() => {
    // The section lives in the hash so a reload or a shared link lands on the same tab (no Suspense needed).
    const fromHash = window.location.hash.replace("#", "");
    if (isSection(fromHash)) setSection(fromHash);
    currentUser()
      .then((profile) => {
        setUser(profile);
        setState(profile.role === "superadmin" ? "ok" : "forbidden");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const choose = (key: Section) => {
    setSection(key);
    window.history.replaceState(null, "", `#${key}`);
  };

  if (state === "loading") return <main className="centered-page">Checking your access…</main>;

  if (state === "forbidden") {
    return (
      <main className="centered-page">
        <div className="admin-forbidden">
          <ShieldCheck size={28} />
          <h1>Platform admins only</h1>
          <p>Your account can build bots, but it cannot manage the platform.</p>
          <Link className="primary-button" href="/dashboard"><ArrowLeft size={15} /> Back to your bots</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="admin-console">
      <aside className="console-nav">
        <div className="console-brand">
          <SpaghettiMark size={28} />
          <div>
            <strong>Spaghetti</strong>
            <small>Admin console</small>
          </div>
        </div>
        <nav aria-label="Console sections">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className={section === key ? "is-active" : ""} aria-current={section === key ? "page" : undefined} onClick={() => choose(key)}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
        <div className="console-nav-footer">
          <Link className="secondary-button" href="/dashboard"><ArrowLeft size={15} /> Back to bots</Link>
          <div className="console-user">
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </div>
          <button className="secondary-button" type="button" onClick={() => { logout(); router.push("/login"); }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <main className="console-main">
        {section === "overview" ? <OverviewSection /> : null}
        {section === "users" && user ? <UsersSection adminId={user.id} /> : null}
        {section === "bots" ? <BotsSection /> : null}
        {section === "access" ? <AccessSection /> : null}
        {section === "deliveries" ? <DeliveriesSection /> : null}
        {section === "audit" ? <AuditSection /> : null}
        {section === "branding" ? <BrandingSection /> : null}
      </main>
    </div>
  );
}
