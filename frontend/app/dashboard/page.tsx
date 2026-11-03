"use client";

import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Blocks,
  Check,
  Copy,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Folders,
  Inbox,
  LayoutGrid,
  ListTree,
  LogOut,
  Pencil,
  Settings,
  Users,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";
import { archiveBot, createBot, duplicateBot, listBots, updateBot } from "@/services/bots";
import { createWorkspace, deleteWorkspace, listWorkspaces, updateWorkspace } from "@/services/workspaces";
import { confirmDialog, promptDialog } from "@/stores/dialog-store";
import { currentUser, logout } from "@/services/auth";
import type { BotRecord, User, WorkspaceRecord } from "@/types/api";

/** Remembers which workspace the dashboard was on, per browser. */
const WORKSPACE_KEY = "spaghetti:workspace";
const ALL = "all";
const UNSORTED = "unsorted";

export default function DashboardPage() {
  const router = useRouter();
  const [bots, setBots] = useState<BotRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [selected, setSelected] = useState<string>(ALL);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createWorkspaceId, setCreateWorkspaceId] = useState("");
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const createRef = useRef<HTMLDialogElement>(null);

  // The create form is a modal dialog, so the grid underneath never moves.
  useEffect(() => {
    const dialog = createRef.current;
    if (!dialog) return;
    if (showCreate && !dialog.open) dialog.showModal();
    if (!showCreate && dialog.open) dialog.close();
  }, [showCreate]);

  const refresh = async () => {
    try {
      const [profile, records, folders] = await Promise.all([currentUser(), listBots(), listWorkspaces()]);
      setUser(profile);
      setBots(records);
      setWorkspaces(folders);
    } catch {
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // The builder sends people here when a bot URL is not theirs; read the query directly so this static page needs no Suspense boundary.
    if (new URLSearchParams(window.location.search).get("notice") === "bot-unavailable") {
      setError("That bot was not found or belongs to another account.");
      window.history.replaceState(null, "", "/dashboard");
    }
    try {
      const saved = window.localStorage.getItem(WORKSPACE_KEY);
      if (saved) setSelected(saved);
    } catch {
      // Storage unavailable: start on All bots.
    }
    void refresh();
  }, []);

  // A remembered workspace that no longer exists falls back to All bots.
  useEffect(() => {
    if (loading) return;
    if (selected !== ALL && selected !== UNSORTED && !workspaces.some((workspace) => workspace.id === selected)) {
      setSelected(ALL);
    }
  }, [loading, selected, workspaces]);

  const choose = (id: string) => {
    setSelected(id);
    setMoveMenuFor(null);
    try {
      window.localStorage.setItem(WORKSPACE_KEY, id);
    } catch {
      // Storage unavailable: the choice still applies for this page.
    }
  };

  // The move menu closes on any click outside it or on Escape.
  useEffect(() => {
    if (!moveMenuFor) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof PointerEvent && (event.target as HTMLElement | null)?.closest(".bot-move")) return;
      setMoveMenuFor(null);
    };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("keydown", close, true);
    };
  }, [moveMenuFor]);

  const workspaceIds = useMemo(() => new Set(workspaces.map((workspace) => workspace.id)), [workspaces]);
  // Bots shared by other people may sit in one of their workspaces; here those count as unsorted.
  const workspaceOf = (bot: BotRecord) => (bot.workspace_id && workspaceIds.has(bot.workspace_id) ? bot.workspace_id : null);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const bot of bots) {
      const key = bot.workspace_id && workspaceIds.has(bot.workspace_id) ? bot.workspace_id : UNSORTED;
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  }, [bots, workspaceIds]);
  const currentWorkspace = workspaces.find((workspace) => workspace.id === selected) ?? null;
  const visibleBots = selected === ALL ? bots : bots.filter((bot) => workspaceOf(bot) === (selected === UNSORTED ? null : selected));
  const plural = (count: number) => `${count} ${count === 1 ? "bot" : "bots"}`;
  const heading =
    selected === ALL
      ? { title: "All bots", copy: `${plural(bots.length)} across your account` }
      : selected === UNSORTED
        ? { title: "Unsorted", copy: "Bots that are not in a workspace yet" }
        : {
            title: currentWorkspace?.name ?? "",
            copy: currentWorkspace?.description || `${plural(visibleBots.length)} in this workspace${currentWorkspace?.can_manage === false && currentWorkspace.owner_name ? ` · created by ${currentWorkspace.owner_name}` : ""}`,
          };

  const openCreate = () => {
    setCreateWorkspaceId(currentWorkspace ? currentWorkspace.id : "");
    setName("");
    setDescription("");
    setError("");
    setShowCreate(true);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const bot = await createBot(name, description, createWorkspaceId || null);
      setShowCreate(false);
      router.push(`/bots/${bot.id}/builder`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create bot");
    }
  };

  const rename = async (bot: BotRecord) => {
    const nextName = await promptDialog({
      title: "Rename bot",
      label: "Bot name",
      defaultValue: bot.name,
      confirmLabel: "Rename",
      validate: (value) => (value ? null : "Enter a name for this bot."),
    });
    if (!nextName || nextName === bot.name) return;
    setError("");
    try {
      const updated = await updateBot(bot.id, { name: nextName });
      setBots((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rename bot");
    }
  };

  const duplicate = async (bot: BotRecord) => {
    setError("");
    try {
      const created = await duplicateBot(bot.id);
      setBots((items) => [created, ...items]);
      if (selected !== ALL && selected !== created.workspace_id && !(selected === UNSORTED && created.workspace_id === null)) choose(created.workspace_id ?? UNSORTED);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not duplicate bot");
    }
  };

  const archive = async (bot: BotRecord) => {
    const confirmed = await confirmDialog({
      title: `Archive “${bot.name}”?`,
      message: "It will be hidden from your dashboard and its public link will stop starting new conversations.",
      confirmLabel: "Archive bot",
      tone: "danger",
    });
    if (!confirmed) return;
    setError("");
    try {
      await archiveBot(bot.id);
      setBots((items) => items.filter((item) => item.id !== bot.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not archive bot");
    }
  };

  const move = async (bot: BotRecord, workspaceId: string | null) => {
    setMoveMenuFor(null);
    if (workspaceOf(bot) === workspaceId) return;
    setError("");
    try {
      const updated = await updateBot(bot.id, { workspace_id: workspaceId });
      setBots((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not move bot");
    }
  };

  const addWorkspace = async () => {
    const workspaceName = await promptDialog({
      title: "New workspace",
      label: "Workspace name",
      placeholder: "e.g. Patient programs",
      confirmLabel: "Create workspace",
      validate: (value) => (value.trim() ? null : "Enter a name for the workspace."),
    });
    if (!workspaceName) return;
    setError("");
    try {
      const workspace = await createWorkspace(workspaceName.trim());
      setWorkspaces((items) => [...items, workspace]);
      choose(workspace.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create workspace");
    }
  };

  const renameWorkspace = async (workspace: WorkspaceRecord) => {
    const nextName = await promptDialog({
      title: "Rename workspace",
      label: "Workspace name",
      defaultValue: workspace.name,
      confirmLabel: "Rename",
      validate: (value) => (value.trim() ? null : "Enter a name for the workspace."),
    });
    if (!nextName || nextName.trim() === workspace.name) return;
    setError("");
    try {
      const updated = await updateWorkspace(workspace.id, { name: nextName.trim() });
      setWorkspaces((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rename workspace");
    }
  };

  const removeWorkspace = async (workspace: WorkspaceRecord) => {
    const count = counts.get(workspace.id) ?? 0;
    const confirmed = await confirmDialog({
      title: `Delete “${workspace.name}”?`,
      message:
        count > 0
          ? `The ${plural(count)} in it are kept and move back to Unsorted. Nothing is archived.`
          : "This workspace is empty. Your bots and everything else stay untouched.",
      confirmLabel: "Delete workspace",
      tone: "danger",
    });
    if (!confirmed) return;
    setError("");
    try {
      await deleteWorkspace(workspace.id);
      setWorkspaces((items) => items.filter((item) => item.id !== workspace.id));
      setBots((items) => items.map((item) => (item.workspace_id === workspace.id ? { ...item, workspace_id: null } : item)));
      choose(ALL);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete workspace");
    }
  };

  if (loading) return <main className="centered-page">Loading your bots…</main>;

  const unsortedCount = counts.get(UNSORTED) ?? 0;

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
          {user?.role === "superadmin" ? (
            <Link className="icon-button dashboard-gear" href="/admin" aria-label="Admin console" title="Admin console: accounts, bots, deliveries, audit log and branding"><Settings size={17} /></Link>
          ) : null}
          <button className="secondary-button" type="button" onClick={() => { logout(); router.push("/login"); }}>
            <LogOut size={16} /> Sign out
          </button>
          <button className="primary-button" type="button" onClick={openCreate}>
            <Plus size={17} /> New bot
          </button>
        </div>
      </header>

      {error && !showCreate ? <p className="form-error dashboard-error" role="alert">{error}</p> : null}

      <dialog
        ref={createRef}
        className="app-dialog create-bot-dialog"
        aria-labelledby="create-bot-title"
        onCancel={(event) => {
          event.preventDefault();
          setShowCreate(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setShowCreate(false);
          }
        }}
        onClick={(event) => {
          // A click on the ::backdrop targets the dialog element itself.
          if (event.target === createRef.current) setShowCreate(false);
        }}
      >
        {showCreate ? (
          <form className="app-dialog-panel" onSubmit={handleCreate}>
            <div className="app-dialog-heading">
              <h2 id="create-bot-title">Create a bot</h2>
              <button className="close-button app-dialog-close" type="button" aria-label="Close" onClick={() => setShowCreate(false)}><X size={17} /></button>
            </div>
            <label className="app-dialog-field">
              Name
              <input required minLength={2} autoFocus value={name} placeholder="e.g. Appointment helper" onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="app-dialog-field">
              Description
              <textarea rows={3} value={description} placeholder="What this bot is for (optional)" onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="app-dialog-field">
              Workspace
              <Select ariaLabel="Workspace" value={createWorkspaceId} options={[{ value: "", label: "No workspace (Unsorted)" }, ...workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))]} onChange={setCreateWorkspaceId} />
            </label>
            {error ? <span className="app-dialog-error" role="alert">{error}</span> : null}
            <div className="app-dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="primary-button" type="submit">Create and open</button>
            </div>
          </form>
        ) : null}
      </dialog>

      <div className="dashboard-shell">
        <nav className="workspace-nav" aria-label="Workspaces">
          <p className="workspace-nav-title">Workspaces</p>
          <button type="button" className={`ws-item${selected === ALL ? " is-active" : ""}`} onClick={() => choose(ALL)}>
            <LayoutGrid size={15} /> <span className="ws-name">All bots</span> <span className="ws-count">{bots.length}</span>
          </button>
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              className={`ws-item${selected === workspace.id ? " is-active" : ""}`}
              onClick={() => choose(workspace.id)}
            >
              {selected === workspace.id ? <FolderOpen size={15} /> : <Folders size={15} />}
              <span className="ws-name">{workspace.name}</span>
              <span className="ws-count">{counts.get(workspace.id) ?? 0}</span>
            </button>
          ))}
          {workspaces.length > 0 && unsortedCount > 0 ? (
            <button type="button" className={`ws-item is-muted${selected === UNSORTED ? " is-active" : ""}`} onClick={() => choose(UNSORTED)}>
              <Inbox size={15} /> <span className="ws-name">Unsorted</span> <span className="ws-count">{unsortedCount}</span>
            </button>
          ) : null}
          <button type="button" className="ws-item ws-new" onClick={() => void addWorkspace()}>
            <FolderPlus size={15} /> New workspace
          </button>
        </nav>

        <section className="workspace-main" aria-label={heading.title}>
          <div className="workspace-heading">
            <div>
              <h2>{heading.title}</h2>
              <p>{heading.copy}</p>
            </div>
            {currentWorkspace && currentWorkspace.can_manage !== false ? (
              <div className="workspace-heading-actions">
                <button type="button" className="secondary-button compact-action" onClick={() => void renameWorkspace(currentWorkspace)}>
                  <Pencil size={14} /> Rename
                </button>
                <button type="button" className="secondary-button compact-action" onClick={() => void removeWorkspace(currentWorkspace)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            ) : null}
          </div>

          <div className="bot-grid">
            {visibleBots.length === 0 ? (
              <div className="empty-dashboard">
                <Sparkles size={28} />
                <h2>{selected === ALL ? "Create your first bot" : "No bots here yet"}</h2>
                <p>{selected === ALL ? "Build a readable conversation flow visually." : "Create a bot in this workspace, or move one in with the Move button on its card."}</p>
                <button className="primary-button" type="button" onClick={openCreate}><Plus size={16} /> New bot</button>
              </div>
            ) : (
              visibleBots.map((bot) => {
                const botWorkspace = workspaces.find((workspace) => workspace.id === workspaceOf(bot));
                const role = bot.access_role ?? "owner";
                const isOwner = role === "owner";
                const canManage = isOwner || role === "admin";
                return (
                  <article className="bot-tile" key={bot.id}>
                    <Link className="bot-tile-main" href={`/bots/${bot.id}/builder`}>
                      <div className="bot-tile-top">
                        <div className="bot-card-icon"><Sparkles size={22} /></div>
                        <span className="status-pill">{bot.status}</span>
                      </div>
                      <h2>{bot.name}</h2>
                      <p>{bot.description || "Visual conversation flow"}</p>
                      {!currentWorkspace && botWorkspace ? (
                        <span className="bot-tile-workspace"><Folders size={12} /> {botWorkspace.name}</span>
                      ) : null}
                      {!isOwner ? (
                        <span className="bot-tile-shared" title={`Shared by ${bot.owner_name || "another account"} · you can ${role === "viewer" ? "view" : "edit"}`}>
                          <Users size={12} /> {bot.owner_name || "Shared"} · {role}
                        </span>
                      ) : null}
                    </Link>
                    <div className="bot-tile-actions">
                      {canManage ? <button type="button" onClick={() => void rename(bot)}><Pencil size={14} /> Rename</button> : null}
                      <button type="button" title="Make a copy of this bot" onClick={() => void duplicate(bot)}><Copy size={14} /> Duplicate</button>
                      {canManage ? (
                      <div className="bot-move">
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={moveMenuFor === bot.id}
                          onClick={() => setMoveMenuFor((current) => (current === bot.id ? null : bot.id))}
                        >
                          <FolderInput size={14} /> Move
                        </button>
                        {moveMenuFor === bot.id ? (
                          <div className="bot-move-menu" role="menu" aria-label={`Move ${bot.name} to a workspace`}>
                            <p className="menu-label">Move to</p>
                            {workspaces.map((workspace) => (
                              <button
                                key={workspace.id}
                                type="button"
                                role="menuitemradio"
                                aria-checked={workspaceOf(bot) === workspace.id}
                                onClick={() => void move(bot, workspace.id)}
                              >
                                <Folders size={14} /> <span>{workspace.name}</span>
                                {workspaceOf(bot) === workspace.id ? <Check size={14} /> : null}
                              </button>
                            ))}
                            <button type="button" role="menuitemradio" aria-checked={workspaceOf(bot) === null} onClick={() => void move(bot, null)}>
                              <Inbox size={14} /> <span>Unsorted</span>
                              {workspaceOf(bot) === null ? <Check size={14} /> : null}
                            </button>
                            <button type="button" className="menu-new" onClick={() => void addWorkspace()}>
                              <FolderPlus size={14} /> <span>New workspace…</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                      ) : null}
                      {canManage ? <button type="button" className="is-archive" onClick={() => void archive(bot)}><Archive size={14} /> Archive</button> : <span className="bot-tile-readonly">{role === "viewer" ? "View only" : "Can edit"}</span>}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
