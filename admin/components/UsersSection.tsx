"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Plus, Search, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import { createUser, deleteUser, listUsers, updateUser } from "@/lib/admin";
import type { AdminUser } from "@/lib/types";
import { useConfirm } from "@/components/useConfirm";

export function UsersSection({ adminId }: { adminId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" as AdminUser["role"] });
  const { confirm, dialog } = useConfirm();

  const toggleActive = async (user: AdminUser) => {
    if (user.is_active) {
      const ok = await confirm({
        title: `Disable sign-in for ${user.email}?`,
        message: "Their sessions stop working immediately and they cannot sign in until you enable the account again.",
        confirmLabel: "Disable sign-in",
        danger: true,
      });
      if (!ok) return;
    }
    await run(() => updateUser(user.id, { is_active: !user.is_active }), `${user.is_active ? "Disabled" : "Enabled"} ${user.email}`);
  };

  const refresh = useCallback(async (q = query) => {
    try {
      setUsers(await listUsers(q));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load accounts");
    }
  }, [query]);

  useEffect(() => { void refresh(""); }, [refresh]);

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

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await createUser(form);
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "user" });
    }, `Account created for ${form.email}`);
  };

  const resetPassword = async (user: AdminUser) => {
    const password = await confirm({
      title: `Set a new password for ${user.email}`,
      message: "They will need to sign in again with it.",
      input: { label: "New password", type: "password", minLength: 8 },
      confirmLabel: "Set password",
    });
    if (typeof password !== "string") return;
    await run(() => updateUser(user.id, { password }), `Password updated for ${user.email}`);
  };

  const remove = async (user: AdminUser) => {
    const target = users.find((item) => item.id !== user.id && item.role === "superadmin") ?? users.find((item) => item.id !== user.id);
    const ok = await confirm({
      title: `Delete ${user.email}?`,
      message: user.bot_count
        ? `This account owns ${user.bot_count} bot${user.bot_count === 1 ? "" : "s"}. ${target ? `They will be moved to ${target.email}.` : "They will be deleted with it."} This cannot be undone.`
        : "This cannot be undone.",
      confirmLabel: "Delete account",
      danger: true,
    });
    if (!ok) return;
    await run(() => deleteUser(user.id, user.bot_count && target ? target.id : undefined), `Deleted ${user.email}`);
  };

  return (
    <section>
      <header className="section-header">
        <div>
          <p className="eyebrow">Accounts</p>
          <h1>Builder accounts</h1>
        </div>
        <button className="primary-button" type="button" onClick={() => setShowCreate((value) => !value)}><Plus size={16} /> New account</button>
      </header>

      {showCreate ? (
        <form className="card form-grid" onSubmit={submitCreate}>
          <label>Name<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Temporary password<input required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          <label>Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AdminUser["role"] })}>
              <option value="user">Builder</option>
              <option value="superadmin">Platform admin</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="primary-button" type="submit">Create account</button>
          </div>
        </form>
      ) : null}

      <div className="toolbar">
        <label className="search">
          <Search size={15} />
          <input placeholder="Search by name or email" value={query} onChange={(event) => { setQuery(event.target.value); void refresh(event.target.value); }} />
        </label>
        <span className="muted">{users.length} account{users.length === 1 ? "" : "s"}</span>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-notice" role="status">{notice}</p> : null}

      <div className="card table-card">
        <table>
          <thead>
            <tr><th>Account</th><th>Role</th><th>Status</th><th>Bots</th><th>Created</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const self = user.id === adminId;
              return (
                <tr key={user.id} className={user.is_active ? "" : "is-muted"}>
                  <td><strong>{user.name}</strong><br /><small>{user.email}{self ? " · you" : ""}</small></td>
                  <td>{user.role === "superadmin" ? <span className="pill pill-admin"><ShieldCheck size={12} /> Admin</span> : <span className="pill">Builder</span>}</td>
                  <td>{user.is_active ? <span className="pill pill-ok">Active</span> : <span className="pill pill-bad">Disabled</span>}</td>
                  <td>{user.bot_count}</td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td className="row-actions">
                    <button type="button" className="icon-button" title="Set new password" onClick={() => void resetPassword(user)}><KeyRound size={15} /></button>
                    {!self ? (
                      <>
                        <button type="button" className="icon-button" title={user.role === "superadmin" ? "Make builder" : "Make platform admin"} onClick={() => void run(() => updateUser(user.id, { role: user.role === "superadmin" ? "user" : "superadmin" }), `Role updated for ${user.email}`)}><ShieldCheck size={15} /></button>
                        <button type="button" className="icon-button" title={user.is_active ? "Disable sign-in" : "Enable sign-in"} onClick={() => void toggleActive(user)}>{user.is_active ? <UserX size={15} /> : <UserCheck size={15} />}</button>
                        <button type="button" className="icon-button icon-button-danger" title="Delete account" onClick={() => void remove(user)}><Trash2 size={15} /></button>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 ? <tr><td colSpan={6} className="muted">No accounts match.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {dialog}
    </section>
  );
}
