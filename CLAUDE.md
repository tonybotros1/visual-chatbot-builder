# Spaghetti — working notes for Claude Code

Spaghetti is a visual chatbot / conversational-form builder: a React Flow canvas (Next.js 16) backed by a FastAPI + PostgreSQL API that owns validation and execution, plus a separate admin console. Read `README.md` for the product overview and the full list of features; this file is about how to work on the repo without breaking it.

## Repository and machines

- **GitHub is the source of truth:** `https://github.com/tonybotros1/visual-chatbot-builder`, branch `main`.
- The owner works from more than one computer. **Always start a session with `git pull origin main`** and **always finish by committing and pushing** — uncommitted work on one machine is invisible on the other.
- `main` is pushed to directly (no PR flow yet). Make focused commits with a real message; don't call them "edits".
- Attribution and CI: every push to `main` runs `.github/workflows/ci.yml` (backend tests + migrations on an empty DB, frontend build, admin build, then the smoke suite on a fresh Compose stack). Don't push red: run the checks below first.

## First-time setup on a new computer

Needs Docker Desktop and Git. Node 22 / Python 3.12+ are only needed for running checks outside Docker.

```bash
git clone https://github.com/tonybotros1/visual-chatbot-builder.git
cd visual-chatbot-builder
cp .env.example .env
```

Then edit `.env`:

- `SUPER_ADMIN_EMAIL` — the owner's email (`t.botros@manzilhealth.ae`).
- `SUPER_ADMIN_PASSWORD` — ask the owner; it is never stored in the repo. The backend creates/updates the super-admin account from these two values on every start.
- `SUPER_ADMIN_NAME` — `Tony Botros`.
- Leave the rest at the example values for local work.

```bash
docker compose up --build
```

- Builder app: http://localhost:3000 (login at `/login`)
- Admin console: http://localhost:3100
- API docs: http://localhost:8000/docs

There is **no demo account**. The only account on a fresh database is the super admin from `.env`; builders register at `/register` or are created in the admin console. With `SEED_DEMO_DATA=true` a sample "Eligibility demo" bot is seeded under the super admin.

The database lives in the Docker volume `postgres_data` on each machine; bots created on one computer are not on the other unless the owner moves a dump. Don't assume specific bots exist.

## Layout

| Path | What it is |
|---|---|
| `frontend/` | Builder app (Next.js 16, React 19, `@xyflow/react`, Zustand). Styles live in `app/globals.css`. |
| `admin/` | Admin console (Next.js 16, plain CSS, no Tailwind). Separate container on port 3100; talks to `/api/admin/*`. |
| `backend/app/` | FastAPI app: `api/routes/*` per domain, `engine/` (validator, executor, subflows, logic, targeting), `services/`, `models/`, `schemas/`. |
| `backend/migrations/versions/` | Alembic migrations, numbered `0001`…`0014`. Add the next number; never edit an applied one. |
| `backend/scripts/smoke_*.py` | End-to-end API checks run inside the backend container. |
| `backend/tests/` | pytest unit/regression tests (52). |
| `backend/constraints.txt` | Exact pinned Python versions; `requirements*.txt` keep ranges. Install with `-c constraints.txt`. |

Before touching Next.js code, read `frontend/AGENTS.md` (also copied to `admin/AGENTS.md`): this is Next.js 16 with breaking changes; check `node_modules/next/dist/docs/` rather than relying on memory. Known gotcha: a prerendered page cannot call `useSearchParams` without a Suspense boundary — read `window.location` in an effect instead.

## Verification — run before every push

```bash
# backend (from backend/, with a venv created from requirements-dev.txt -c constraints.txt)
python -m pytest -q

# frontend and admin
cd frontend && npm run typecheck && npm run build
cd ../admin && npm run typecheck && npm run build

# smoke suite, with the Compose stack running
docker compose exec backend python -m scripts.smoke_test
docker compose exec backend python -m scripts.smoke_v2
docker compose exec backend python -m scripts.smoke_v2b
docker compose exec backend python -m scripts.smoke_release
```

Browser-test any visual or canvas change in a real browser; there are no frontend unit/E2E tests yet (adding Playwright is the top open task).

If the Compose frontend ever crashes with a Turbopack "task type" panic, it's the `.next` cache: `docker compose down` and remove the `frontend_next` / `admin_next` volumes.

## Rules that must hold

Security / data
- Never commit `.env`, credentials, API keys, uploads, build output, `node_modules`, or virtual environments. Provider credentials are entered in a bot's **Integrate** page and stored encrypted; they never go in env vars, source, logs, or docs.
- Backend validation and execution are authoritative; the browser only edits the flow document.
- Published bot, subflow, and logic versions are immutable; deployments pin versions.
- Webhook targets must be public HTTPS (SSRF guard stays).
- `/api/admin/*` requires `role == "superadmin"` (`get_super_admin` dependency). Disabled accounts (`is_active = false`) cannot sign in.

Product conventions (the owner has asked for these; don't undo them)
- Product name is **Spaghetti**. Builder and Design surfaces stay white; colour only for focus, status, node identity and primary actions. Save Draft is green.
- The properties drawer opens on the right **only when an existing node is clicked** — never on add, drag, or search. Delete Node is always its last action. Destructive actions use the themed confirm dialog (`frontend/stores/dialog-store.ts` + `components/ui/DialogHost.tsx`) — no `window.confirm/prompt/alert`.
- Do not reintroduce the node Internal Note field, or expose Variable Name / Selection Limits in the standard node UI.
- One outgoing edge per output handle; choosing a new jump target replaces the old edge. Edges route around nodes. Click-to-add places nodes in the visible viewport without overlap; drag/drop keeps the drop position.
- Editor **Validate** reports connectivity only; publish runs full strict validation.
- Optional questions get a visible Skip control and a Skip route.
- Visitor preview shows no execution trace and must not flash a fallback colour before the saved theme loads.
- Locales: adding a locale must **not** make it the default (that flipped English bots to RTL). Only "Make default" or `?locale=` changes what visitors see.
- Node labels are WYSIWYG, serialized to allow-listed HTML and sanitized again on render.

## Current state (as of 2026-10-30)

Done and verified: V1/V2/V2B features from the handoff, themed dialogs, admin console, super-admin role, locale fixes, CI, pinned constraints. All checks above are green at commit `f175231`.

Known debt / next steps, in priority order:
1. Add Playwright browser tests (login, builder save/reload, publish, preview, public chat, dialogs, click-to-add placement) and wire them into CI.
2. Replace the `document.execCommand` rich-text editor with a maintained editor; move inline images from base64 to object storage.
3. Verify live providers in a staging environment once the owner supplies credentials (SMTP first, then Microsoft/Google Calendar, Stripe/PayPal, S3, SMS).
4. Production hardening: shared rate limiter, real malware scanning, backups, observability.
5. Make the QA and Deploy pages less JSON-heavy for non-technical users.

When finishing a task: run the checks, commit with a descriptive message, `git push origin main`, and update the "Current state" section here if it changed.
