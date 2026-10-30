# Spaghetti

Untangle your conversations with a visual workflow, chatbot, knowledge-base, and automation platform.

Visual form and chatbot platform implemented across the V1, V2, and V2B blueprints. It runs locally with Next.js, FastAPI, PostgreSQL, and a retry worker.

## Product coverage

### V1 foundation

- Account registration/login, JWT authentication, bot dashboard, and archive workflow
- React Flow canvas with drag/drop, single-route output replacement, automatic stale-edge cleanup, zoom, minimap, search, node properties, browser fallback, and PostgreSQL draft persistence
- Server-owned validation and deterministic execution with immutable published versions
- Public chat, draft preview, conversation storage, response detail, and answer validation

### V2 modularity, logic, QA, and analytics

- Reusable subflows with typed contracts, immutable versions, explicit mappings, exact dependency pins, nested execution, and cycle/depth protection
- Reusable rule sets and decision tables with deterministic hit policies, typed contracts, traces, versioning, and visual flow nodes
- Regression scenarios with saved answer fixtures and expected outcomes
- Preview debugger plus node metrics for entries, answers, drop-off, errors, and average dwell time
- Dependency inventory on each published bot version

### V2B parity and operations

- Searchable List, Multiple Choice, Range, Rating, Opinion Scale, Date, File Upload, Payment, Appointment, Links, Thank You/CTA, WhatsApp, and SMS OTP behavior
- Text regex/length rules, email-domain restrictions, numeric limits/steps, multi-select limits, date limits, stable option values, and server-side enforcement
- Secure local or S3-compatible uploads, signed downloads, MIME/size/count checks, EICAR screening, and conversation-bound verification
- Verified sandbox/cash payments plus live Stripe Checkout and PayPal Orders adapters with server-side confirmation
- Local appointment availability/conflict locking plus Google Calendar and Microsoft Calendar adapters
- Generic SMS OTP gateway with expiring hashed challenges, attempt limits, and preview-only sandbox codes
- Widget, inline embed, and share-link deployments pinned to immutable bot versions with short-lived signed targeting eligibility tickets
- JavaScript SDK with `init`, `open`, `close`, `toggle`, `destroy`, event listeners, automatic `data-deployment` initialization, and targeting-aware bootstrap
- Nested audience segments, context rules, schedules, frequency caps, environment separation, verified custom domains, pause/archive, and version refresh
- Response search/filter, statuses, tags, internal notes, metadata/source capture, retention purge, deletion, and CSV/JSON/real XLSX export
- Encrypted credential vault; email, webhook, Slack, and SMS notifications; HMAC signing; durable outbox; retry worker; and delivery history
- Viewer/editor/admin collaboration, owner protection, and audit logs
- Locale catalogs, safe fallback text, locale selection, and LTR/RTL runtime layout
- Public rate limits, request-size enforcement, security headers, SSRF controls, short-lived provider tickets, and secret redaction

## Start the complete stack

```bash
docker compose up --build
```

Open:

- Dashboard: http://localhost:3000/dashboard
- Demo builder: http://localhost:3000/bots/00000000-0000-0000-0000-000000000002/builder
- API docs: http://localhost:8000/docs

- Admin console: http://localhost:3100

There is no built-in demo account. The platform super admin is created from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `.env` on startup (the password is re-applied on every start, so it can be rotated by redeploying). Builders register themselves at `/register` or are created from the admin console.

The backend runs every Alembic migration and, when `SEED_DEMO_DATA=true`, seeds the sample "Eligibility demo" bot under the super admin. The `integration-worker` service processes notification deliveries and retries.

## Admin console

`admin/` is a separate Next.js application served from its own container on port 3100. It talks to the same API through `/api/admin/*`, which only accepts accounts with the `superadmin` role. It covers platform overview counts, builder accounts (create, disable, reset password, delete with content transfer), all bots (archive/restore, transfer owner), notification delivery retries, and the global audit log.

## Verify

```bash
cd backend
.venv/bin/python -m pip install -r requirements-dev.txt -c constraints.txt
.venv/bin/python -m pytest -q

cd ../frontend
npm run typecheck
npm run build

cd ../admin
npm run typecheck
npm run build

cd ..
docker compose exec backend python -m scripts.smoke_test
docker compose exec backend python -m scripts.smoke_v2
docker compose exec backend python -m scripts.smoke_v2b
docker compose exec backend python -m scripts.smoke_release
```

`backend/constraints.txt` pins the exact package versions the tests and Docker image were verified with; the requirement files keep version ranges. To upgrade, install without `-c`, rerun the checks, and refresh the file with `pip freeze`.

GitHub Actions (`.github/workflows/ci.yml`) runs the same checks on every push to `main` and every pull request: backend tests and migrations on an empty PostgreSQL database, frontend typecheck and build, then the four smoke scripts against a fresh Compose stack.

If you run `npm run dev` on the host while the Compose frontend is also used, each keeps its own `.next` cache (the container's lives in the `frontend_next` volume), so the two no longer corrupt each other.

Preview saves and cleans the current graph before it opens. Incomplete paths can be previewed while the separate **Validate** action shows every publish-blocking issue and selects the first affected node.

## Live provider configuration

Local storage, sandbox payments, and the local calendar work without third-party accounts. Live services need credentials saved from a bot's **Integrate** page:

- Stripe: `secret_key`; configure `success_url`, `cancel_url`, and optional `product_name`.
- PayPal: `client_id` and `client_secret`; choose sandbox or production and configure return/cancel URLs.
- S3-compatible storage: `access_key_id`, `secret_access_key`, optional `session_token`; configure bucket, region, HTTPS endpoint, and path-style behavior.
- Google or Microsoft Calendar: OAuth `access_token`; configure `calendar_id`.
- SMS OTP: HTTPS gateway URL and optional bearer `token`; the gateway receives `to`, `message`, and `sender` JSON.
- SMTP email: host/port/from/to plus optional username/password.
- Webhook/Slack: public HTTPS URL plus an optional signing secret/token.

Secrets are encrypted at rest using a key derived from `SECRET_KEY` and are never returned by the API. Set a strong, stable production `SECRET_KEY`; changing it makes existing credentials unreadable.

## Environment

Copy `.env.example` to `.env`. For a non-local deployment, change at least `POSTGRES_PASSWORD`, `SECRET_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, and `CORS_ORIGINS` (a JSON list of allowed browser origins).

Custom hostnames require HTTPS, routing to the deployed frontend/API, and the verification token served at `/.well-known/visual-chatbot-builder-verification`.

## Project layout

```text
frontend/                    Next.js product UI and public chat runtime
backend/app/api/             Authenticated and public FastAPI routes
backend/app/engine/          Flow, logic, targeting, and validation
backend/app/models/          SQLAlchemy persistence models
backend/app/services/        Runtime, exports, providers, vault, integrations, audit
backend/app/workers/         Durable delivery worker
backend/migrations/versions/ Ordered Alembic migrations
backend/tests/               Deterministic unit and regression tests
```

## Operational notes

- Published bots and deployments pin immutable versions; updating a deployment is explicit.
- External provider calls require public HTTPS destinations. Private, loopback, link-local, and unsafe webhook targets are rejected.
- The bundled rate limiter is per API process. Multi-replica production should use a shared Redis-backed limiter.
- The local malware check rejects the EICAR signature. Production should also enable provider-native scanning or ClamAV.
