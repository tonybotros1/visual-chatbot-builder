# Spaghetti — working notes for Claude Code

Spaghetti is a visual chatbot / conversational-form builder: a React Flow canvas (Next.js 16) backed by a FastAPI + PostgreSQL API that owns validation and execution, plus an admin console inside the builder at `/admin`. Read `README.md` for the product overview and the full list of features; this file is about how to work on the repo without breaking it.

## Repository and machines

- **GitHub is the source of truth:** `https://github.com/tonybotros1/visual-chatbot-builder`, branch `main`.
- The owner works from more than one computer. **Always start a session with `git pull origin main`** and **always finish by committing and pushing** — uncommitted work on one machine is invisible on the other.
- `main` is pushed to directly (no PR flow yet). Make focused commits with a real message; don't call them "edits".
- Attribution and CI: every push to `main` runs `.github/workflows/ci.yml` (backend tests + migrations on an empty DB, frontend build, then the smoke suite on a fresh Compose stack). Don't push red: run the checks below first.

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
| `frontend/app/admin/`, `frontend/components/admin/` | Admin console (Overview, Accounts, Bots, Deliveries, Audit log, Branding), reachable from the dashboard gear icon for `superadmin` accounts; talks to `/api/admin/*`. |
| `backend/app/` | FastAPI app: `api/routes/*` per domain, `engine/` (validator, executor, subflows, logic, targeting), `services/`, `models/`, `schemas/`. |
| `backend/migrations/versions/` | Alembic migrations, numbered `0001`…`0015`. Add the next number; never edit an applied one. |
| `backend/scripts/smoke_*.py` | End-to-end API checks run inside the backend container. |
| `backend/tests/` | pytest unit/regression tests (63). |
| `backend/constraints.txt` | Exact pinned Python versions; `requirements*.txt` keep ranges. Install with `-c constraints.txt`. |

Before touching Next.js code, read `frontend/AGENTS.md`: this is Next.js 16 with breaking changes; check `node_modules/next/dist/docs/` rather than relying on memory. Known gotcha: a prerendered page cannot call `useSearchParams` without a Suspense boundary — read `window.location` in an effect instead.

## Verification — run before every push

```bash
# backend (from backend/, with a venv created from requirements-dev.txt -c constraints.txt)
python -m pytest -q

# frontend
cd frontend && npm run typecheck && npm run build

# smoke suite, with the Compose stack running
docker compose exec backend python -m scripts.smoke_test
docker compose exec backend python -m scripts.smoke_v2
docker compose exec backend python -m scripts.smoke_v2b
docker compose exec backend python -m scripts.smoke_release
```

Browser-test any visual or canvas change in a real browser; there are no frontend unit/E2E tests yet (adding Playwright is the top open task).

If the Compose frontend ever crashes with a Turbopack "task type" panic, it's the `.next` cache: `docker compose down` and remove the `frontend_next` volume.

## Rules that must hold

Security / data
- Never commit `.env`, credentials, API keys, uploads, build output, `node_modules`, or virtual environments. Provider credentials are entered in a bot's **Integrate** page and stored encrypted; they never go in env vars, source, logs, or docs.
- Backend validation and execution are authoritative; the browser only edits the flow document.
- Published bot, subflow, and logic versions are immutable; deployments pin versions.
- Webhook targets must be public HTTPS (SSRF guard stays).
- Chat layouts (`appearance.layout_style`): Card (bar header), Personal (compact centred gradient header), Modern (primary header, accent stripe, squared corners, uppercase options) and Spotlight (white card on a full-colour page, avatar medallion overlapping the top; the runtime wraps the shell in `.chat-spotlight-backdrop`). Minimal was retired (bots saved with it load as Card). Each has a `.design-style-<name>` block for the Design preview and a matching `.chat-layout-<name>` block for the runtime at the end of `globals.css`; keep the two in step when changing one.
- Design tab structure (Collect.chat-style): an Avatar + Theme colour card (reply avatar, primary colour, other colours under "More colours"), then a Widget | Page card. Widget holds `appearance.widget_position` (left/center/right) and `appearance.widget_welcome`; Page holds the layout picker (Card, Personal, Modern, Spotlight), title, description, profile picture and `appearance.links` (shown under the title in the chat header). The preview on the right is a browser frame with Widget / Page / Embed tabs; the Widget mock opens the popup only when the welcome toggle is on. The published values reach the website widget through `DeploymentBootstrap.widget` (`_widget_config` in `routes/deployments.py`: position, welcome + first question text, launcher avatar, primary colour) and the shared `WIDGET_LAUNCHER_JS` used by both `/public/sdk/v1.js` and `/public/deployments/{key}/embed.js` (round avatar launcher, welcome bubble, panel aligned to the same side).
- Responses page: rows are labelled `Response #N` (`ConversationRead.response_number`, 1-based per bot by start time), paged 10 at a time in the browser, and each answer carries `question` (node label as plain text, components included) and `answer_text` (option labels instead of stored values) computed in `_conversation_read`.
- `settings.delivery_mode` is no longer edited anywhere in the UI (the "Default delivery type" card was removed as a duplicate of the Share tab's channel picker); the Share tab opens on the channel used last for that bot (`spaghetti:share-mode:<botId>` in localStorage, default `link`). Keep the field for compatibility only.
- Every bot gets a 7-character `share_code` on first read (`ensure_share_code` in `api/routes/bots.py`, migration 0017). `/r/<code>` (frontend `app/r/[code]`) resolves it through the public `GET /api/public/r/<code>` to the published bot and renders its latest published version (deployment-specific links stay on the Deploy page); the Share tab's Link section shows this short link, social share buttons, the custom domain and a social preview. Builder pages can switch tabs by dispatching `spaghetti:open-tab` with the tab name.
- Share links, QR codes and embed snippets use the platform **public address** when an admin set one (admin console → Access → Public address; `GET /api/platform/site` public, `PUT` super admin, key `site` in `platform_settings`), otherwise the address the page was opened with. Components get it from `hooks/usePublicSiteUrl.ts`, never from `window.location` directly.
- The app is used over plain `http://<LAN-IP>`, which browsers treat as an insecure context: never call `crypto.randomUUID()` (undefined there); use `randomId()` from `services/ids.ts`, and copy with `copyText()` from `services/clipboard.ts` (falls back to the selection-based copy when `navigator.clipboard` is missing). The builder preview redirects to `/login?next=…` on a 401 and the login page honours `next`.
- LAN access: `services/api.ts` exports `apiBaseUrl()`/`siteBaseUrl()`, which swap a localhost default for the hostname the page was opened with, so `http://<LAN-IP>:3000` talks to `http://<LAN-IP>:8000/api` with no rebuild. Never read `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_SITE_URL` directly elsewhere. The backend's `cors_origin_regex` accepts private-network origins by default.
- Bot visibility is a platform setting (`platform_settings` key `access`, `GET/PUT /api/platform/access`, admin console → Access): `private` (owner + invited collaborators, the default in code and tests), `view` (every account is at least viewer on every bot) or `edit` (at least editor). `resolve_role`/`access_role` in `api/routes/bots.py` compute the caller's role; platform admins are `admin` on every bot and owners are `owner` (rank 4). Moving a bot between workspaces needs the `admin` rank (owner, admin collaborator or platform admin). `BotRead` carries `owner_name` and `access_role`, and the dashboard hides Rename/Archive/Move accordingly. Workspaces follow the same rule: under `view`/`edit` (or for platform admins) `GET /api/workspaces` returns every account's workspaces with `can_manage` (creator or platform admin) and bots can be filed into any of them; under `private` they stay personal.
- The **platform owner** is the account named by `SUPER_ADMIN_EMAIL` (`User.is_owner`): seeded as an active super admin on every start, and `guard_owner` in `api/routes/admin.py` refuses role/access changes and deletion for it (other admins cannot even reset its password). The UI shows it with an Owner pill and no destructive actions.
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
- A choice node whose variable is `language` (or `locale`, `preferred_language`, or with `switch_locale: true`) switches the conversation locale when answered: direction follows the code (Arabic and other RTL codes flip the chat), the bot's locale catalog for that code is applied if one exists, and the visitor-chat UI strings (`components/chatbot/runtime-strings.ts`) follow the active locale. Store language codes in `option_values` (`en`, `ar`).
- Public link slugs are stable: renaming a bot keeps its slug, the slug is edited explicitly (Settings > General, `PUT /api/bots/{id}` with `slug`), and archiving a bot releases its slug.
- QA scenarios' `expected` accepts only `status`, `terminal_node_id` and `variables`; unknown keys are rejected so a typo cannot pass silently.
- The canvas has two views toggled from the toolbar (before Auto arrange) and remembered per browser in localStorage (`spaghetti:canvas-view`): **Detailed** shows full node content; **Compact** (`.flow-canvas.is-compact`) uses fixed 260px cards, clamps labels to three lines, hides descriptions, adds a category stripe and fades everything except the selected node and its neighbours. Both are CSS-only on top of the same node components.
- File uploads go to **Azure Blob Storage** when `AZURE_STORAGE_*` (or `AZURE_STORAGE_CONNECTION_STRING`) is set in `.env` (`app/services/azure_blob.py`, REST + Shared Key, no SDK; container `spaghetti-uploads` is created on demand); otherwise they stay on disk under `UPLOAD_DIRECTORY`. `StoredFile.storage_provider` is `local`, `azure` or `s3`; a NULL `connection_id` with `azure` means the platform account. A bot can still point a file-upload node at its own "storage" integration connection: config `{provider: "azure", account, container}` + secret `account_key`, or the S3 shape. The account key lives only in `.env`, never in source or logs.
- Chat avatars: `appearance.avatar_url` (header profile picture) and `appearance.reply_avatar` (`profile` | `custom` | `hidden`, with `reply_avatar_url`) decide the `.chat-reply-avatar` element beside bot bubbles (a real element, not a pseudo-element, so the default mark can render). Pictures are stored inline as data URLs; the Design tab downscales uploads to 512px in the browser (`prepareAvatarImage`, sources up to 25 MB) and offers built-in presets from `frontend/public/avatars/*.svg`, inlined on pick.
- **Branding** is platform-wide: `GET /api/branding` (public) and `PUT /api/branding` (super admin) read/write the `branding` row of `platform_settings` (`primary_color`, `secondary_color`). `components/brand/BrandingProvider.tsx` sets `--brand-primary`/`--brand-secondary` on `<html>` from a localStorage cache and then the API. CSS rule: UI states (hover, focus, active, links, selection) use `var(--brand)`; `var(--brand-secondary)` is only for logic/component node accents and decorative contrast; never hard-code the hex values. Super admins edit colours in the admin console (`/admin#branding`).
- Dropdowns are never native `<select>`: use `components/ui/Select.tsx` (`Select` with `{ value, label }` options, `ariaLabel`, optional `size="sm"`; filter box appears automatically for 10+ options; the menu flips upward near the viewport bottom). Styles live under `.spaghetti-select*`; a dialog that contains one gets `overflow: visible` via `.app-dialog:has(.spaghetti-select)`.
- Dashboard **workspaces** (`workspaces` table, `bots.workspace_id` nullable FK with `ON DELETE SET NULL`, routes in `api/routes/workspaces.py`) are per-account folders: only the bot owner can file a bot into one of their own workspaces (`BotUpdate.workspace_id`; an explicit `null` moves it to Unsorted, leaving the field out keeps it; collaborators get 403). Deleting a workspace never touches bots. The dashboard (`app/dashboard/page.tsx`) shows them as a left nav (All bots / workspaces / Unsorted) with the selected folder's bots in a grid of `.bot-tile` cards and a Move menu per card; the selection is remembered in `spaghetti:workspace`.
- The canvas also has two layouts, switched with the `Flow | Tree` control next to the view toggle and remembered per browser (`spaghetti:canvas-layout`). **Flow** uses the saved positions. **Tree** (`components/flow/tree-layout.ts`) computes a top-down hierarchy from Start in option order, centres parents over children, draws parent-to-child edges with `TreeEdge` and every other connection into a shared node as a `JumpStubEdge` chip ("Not now · #30") that pans to the target; nodes in the tree can still be dragged, which records a per-node nudge from the computed slot (`treeOffsets` in the store; not saved, cleared by Auto arrange and on load) while saved positions stay untouched; nodes not reachable from Start keep their saved position and drag normally, so a freshly added node lands where it was dropped; a branch folds from the chevron in the node header (or double-click). Target handles move to the top centre and plain source handles to the bottom centre by CSS in tree mode.
- Edge routing (`components/edges/ObstacleAwareEdge.tsx`) only re-routes edges whose endpoints move while a node is dragged and only considers nodes in the edge's horizontal band; keep it that way, a 100-node flow froze before.

## Current state (as of 2026-10-30)

Done and verified: V1/V2/V2B features from the handoff, themed dialogs, admin console, super-admin role, locale fixes, CI, pinned constraints. All checks above are green at commit `f175231`.

2026-10-30 session (uncommitted at time of writing): clean login/register screens with the Manzil logo; brand primary is teal `#00a1b0`; Design-tab chat-style panel restructured (compact colour grid, preset chips); fifth chat layout **Spotlight** (full-colour backdrop, centred card, avatar medallion); builder toolbar trimmed (Reset removed, secondary pages under a More menu, flat Save draft); in-chat language switching with RTL; localized runtime strings; link pills follow the bot colour; backend healthcheck gates the delivery worker; strict QA `expected` schema; stable/editable slugs; obstacle-edge routing made drag-safe for large flows; canvas fits the view after the draft loads. Three bilingual program bots (THABIT, Roche OCREVUS, VOXZOGO) were generated through the API and live in the local database.

QA pass (2026-10-30, same session): a 146-check API suite (scratchpad `qa_api.py`, not in the repo) built a bot using every node type and drove it through file upload, local appointments, sandbox payment, sandbox OTP, logic assets and a component; it found and fixed: provider actions and answers inside a subflow frame failed (`current_flow_node` in `services/providers.py`), the validator ignored variables written by logic/subflow outputs, logic evaluation and domain verification returned 500 on bad input, targeting rules were accepted unvalidated (now `TargetingRules` in `schemas/deployment.py`), collaborators with too low a role got 404 instead of 403, and the visitor chat grid mis-sized when the progress bar was on. Backend tests: 61. Follow-up the same day: confirm dialogs on Deploy/Team/Locales/admin disable, breadcrumb header on the subflow builder, new bots open as Saved (default flow carries node numbers), node search highlights matches, upload widget hides the native control. Known gaps still open: archived deployments keep hostnames; segment names can repeat; QA page is raw JSON.

Known debt / next steps, in priority order:
1. Add Playwright browser tests (login, builder save/reload, publish, preview, public chat, dialogs, click-to-add placement) and wire them into CI.
2. Replace the `document.execCommand` rich-text editor with a maintained editor; move inline images from base64 to object storage.
3. Verify live providers in a staging environment once the owner supplies credentials (SMTP first, then Microsoft/Google Calendar, Stripe/PayPal, S3, SMS).
4. Production hardening: shared rate limiter, real malware scanning, backups, observability.
5. Make the QA and Deploy pages less JSON-heavy for non-technical users.

When finishing a task: run the checks, commit with a descriptive message, `git push origin main`, and update the "Current state" section here if it changed.
