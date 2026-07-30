# Task Central — agent orientation

Self-hosted **homelab machine provisioning & documentation tracker**. Single user. You inventory
every VM / LXC / physical machine / hypervisor host / router-network, and for each machine you get
a generated setup **checklist**, recurring maintenance **reminders**, **services / storage /
network equipment / VLANs / dependencies / notes**, and a copy-pasteable **Obsidian Markdown
document**. Optional **Telegram alerts** for stale pending tasks and due reminders. The whole app
is behind a **login**.

This file orients you fast; read the referenced files for detail. Paths are relative to the repo
root (`/taskcentral`).

## Stack & topology
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, sandboxed Jinja2.
  Runs under uvicorn on `:8000` in the `backend` container.
- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS **v4** (CSS-first `@theme`), TanStack
  Query, React Hook Form + Zod, Lucide icons. Built to static files served by **nginx on `:8484`**,
  which reverse-proxies `/api` → `backend:8000` (see `frontend/nginx.conf`).
- **DB:** SQLite at `./data/taskcentral.db` (bind-mounted). Swap to Postgres via `DATABASE_URL`.
- **Logs:** persistent diagnostics are bind-mounted at `./logs/`. `taskcentral.log` contains backend,
  integration, startup, and failed-request entries; `frontend.log` contains nginx proxy/server
  errors. Both rotate by size and keep numbered backups.
- **Deploy:** `docker-compose.yml` (services `backend`, `frontend`). Backend container CMD runs
  `alembic upgrade head` then uvicorn, so **migrations apply on startup**.
- **End-user releases:** `release/compose.yml` uses prebuilt, pinned GHCR images. The release
  bundle includes guided install/update/backup/restore/uninstall scripts. `.github/workflows/`
  validates the repository and publishes `amd64`/`arm64` images plus a versioned GitHub Release.
  `backend/Dockerfile.release` uses the repository root as build context so `MANUAL.md` is baked
  into the backend image and updates with each release.
- **Runtime dependency:** backend images install `iputils-ping` for machine reachability checks.
  Telegram + auth + CLI otherwise use stdlib beyond requirements.txt.

### Common commands
```bash
# from repo root
docker compose build backend frontend && docker compose up -d backend frontend
docker compose exec backend python -m app.cli setpassword          # reset login password
# backend tests (venv already at backend/.venv)
cd backend && .venv/bin/python -m pytest tests -q
# frontend checks
cd frontend && npx tsc -b && npm run build && npx vitest run
```
App URL: http://localhost:8484 (API docs at `/api/docs`). Health: `/api/v1/health`.

## Repo layout
```
backend/app/
  config.py            Settings (pydantic-settings): DATABASE_URL, SECRET_KEY, AUTH_*, timezone bits
  database.py          build_engine / SessionLocal / get_db (StaticPool for in-memory tests)
  main.py              FastAPI app, lifespan (seed + background alert_loop), CORS,
                       require_authentication middleware, body-size limit, docs at /api/docs
  cli.py               `python -m app.cli setpassword [--reset]`
  models/              SQLAlchemy models (see Data model)
  schemas/             Pydantic v2 request/response models; common.py has the enums
  routers/             One module per resource; __init__.py builds api_router (prefix /api/v1)
  services/            Business logic (see Key services)
  alembic/versions/    Migrations (see Migrations)
frontend/src/
  main.tsx             Providers + first-run gate + <AuthGate> (setup vs login vs app)
  App.tsx              Routes
  index.css            Tailwind v4 @theme tokens + light/dark themes
  lib/                 api.ts, auth.tsx, authToken.ts, theme.ts, queries.ts, types.ts, utils.ts
  components/          LoginScreen, layout/, ui/ (design system), machine/ (form pieces + dialogs)
  pages/               Dashboard, Machines, new-machine/, machine/ (detail + tabs), *Templates, Settings
release/
  compose.yml          End-user deployment using pinned prebuilt images
  _common.sh           Shared validation, locking, health, online-backup, and restore helpers
  install.sh           Generates secrets, pulls images, starts, and verifies
  update.sh            Discovers/pins releases, backs up, updates, health-checks, and rolls back
  backup.sh            SQLite online backup through the backend container
  restore.sh           Confirmed restore with an automatic safety backup
  uninstall.sh         Safe container removal; data deletion requires an explicit option
logs/
  .gitkeep             Host-readable rotating runtime logs are written here by Compose
.github/workflows/
  ci.yml               Backend/frontend/release-file checks
  release.yml          Multi-architecture GHCR images, attestations, bundle, and GitHub Release
```

## Data model (`backend/app/models/`)
Integer PKs, `TimestampMixin` (created_at/updated_at, `base.py`). Enum-ish columns are guarded by
named `CHECK` constraints (widened over time via batch migrations).

- **machine.py** — `Machine` (the core entity) + child tables, all `ondelete=CASCADE`:
  `Tag`/`machine_tags` (m2m), `Service`, `StorageDevice`, `NetworkDevice`, `NetworkSegment`,
  `Dependency` (self-ref: `machine_id` depends on `depends_on_machine_id` or free-text
  `external_name`), `MachineNote`. `Machine.machine_type ∈ {VM,LXC,PHYSICAL,HOST,NETWORK}`,
  `status ∈ {Draft,In Progress,Active,Maintenance,Retired,Archived}`, soft-delete via `archived_at`.
  Network fields (isp/connection_type/download_speed/upload_speed/wan_type/responsibilities) and
  `hypervisor` live on Machine too.
- **task.py** — `TaskTemplate` (scoped `ALL|VM|LXC|PHYSICAL|HOST|NETWORK`) → `MachineTask`
  (independent copy per machine; status `Pending|In Progress|Completed|Blocked|Not Applicable`).
- **reminder.py** — `ReminderTemplate` (scoped, `interval_days`) → `MachineReminder`
  (`last_performed_at`, `next_due_at`, `enabled`, `last_notified_due_at`).
- **template.py** — `ObsidianTemplate` (one per machine_type, Jinja content).
- **misc.py** — `GeneratedDocument` (versioned doc snapshots), `ActivityEvent` (audit log),
  `ApplicationSetting` (**key/value store; values are JSON-encoded strings**). Settings that aren't
  in `SettingsOut` (e.g. `auth_password_hash`, `last_alert_sent_at`) are stored here but not exposed.

## Core domain concepts & seams
- **Machine type drives everything.** Field visibility (`frontend/src/components/machine/MachineFields.tsx`),
  which detail tabs show (`frontend/src/pages/machine/MachineDetail.tsx` → `tabsForType`), and which
  templates apply. `NETWORK` machines are special-cased to get **only** NETWORK-scoped
  tasks/reminders (not `ALL`) — see `services/checklist.py::applicable_templates` and
  `services/reminders.py::applicable_reminder_templates`.
- **Templates → per-machine copies at creation.** `services/checklist.py::generate_checklist` and
  `services/reminders.py::generate_reminders` run in `routers/machines.py::create_machine` (and the
  duplicate flow). Editing a template never touches existing machines; the detail tab's "Apply new
  defaults" adds missing ones (`missing_*` / `apply_missing_*`).
- **Host ↔ guest auto-link.** A VM/LXC whose `host` string matches a `HOST` machine's name gets a
  `Dependency(type="Host")` created automatically, so the host's "machines that depend on me" and
  its Obsidian doc list its guests. See `services/hosts.py` (`sync_host_dependency`,
  `link_existing_guests`), invoked from `create_machine`/`update_machine`.
- **Machine reachability.** `services/connectivity.py::ping_ip_address` invokes `iputils-ping`
  without a shell and only against the validated IP stored on the machine. The authenticated
  `/machines/{id}/connectivity` endpoint is polled every 30 seconds by `MachineDetail.tsx`.
  “Offline” means no ICMP reply and does not prove the host is powered off.
- **Versioned changelog.** `services/changelog.py` selects only the running
  `TASKCENTRAL_VERSION` section from root `CHANGELOG.md`; release images bake the file into
  `/app`. `routers/changelog.py` exposes the current entry and stores the internal
  `changelog_seen_version` acknowledgement. `Layout.tsx` opens it once on `/` after an update and
  always exposes the sidebar button. First-run setup marks its current version seen.
- **Obsidian generation.** `services/rendering.py` renders the per-type `ObsidianTemplate` with a
  **sandboxed** Jinja env (`jinja2.sandbox.SandboxedEnvironment`) over a context built in
  `build_context` (machine fields + services/storage/network_devices/network_segments/
  dependencies/reverse_dependencies/hosted_machines/checklist). Output is snapshotted as a
  `GeneratedDocument`. `SAMPLE_CONTEXT` powers template previews. Default templates + the variable
  list are in `services/defaults.py`.
- **Alerts / Telegram.** `services/telegram.py` sends via the Bot API using **stdlib urllib**,
  **plain text, no parse_mode** (injection-safe). `services/alerts.py` runs an asyncio
  `alert_loop` (started in `main.py` lifespan, single worker) that every ~60s calls
  `run_alert_check` (stale pending tasks, respecting a frequency) and `run_reminder_check` (due
  reminders, once per due cycle, gated to a **daily send time in the app timezone**). Config lives
  in application_settings; there's a `POST /settings/test-telegram` for the test button.
- **Local AI.** `services/llm.py` validates private/local destinations, calls Ollama or an
  OpenAI-compatible server, discovers models through `/api/tags` or `/models`, and sends chat
  requests through `/api/chat` or `/chat/completions`. Setup and Settings use separate
  `/llm-models` endpoints because setup discovery is public only while first-run setup remains
  incomplete.
- **Timezone.** One app-wide display timezone (setting `timezone`, default `America/New_York`).
  Frontend: `lib/utils.ts` (`appTimeZone` module cache, synced from settings in `Layout`, parses
  tz-less UTC timestamps by appending `Z`). Backend doc rendering + alert day-rollover use it via
  `rendering.py::_resolve_tz`. **The container clock is UTC**; only display/rollover use the setting.
- **Auth.** `services/auth.py`: HMAC-signed session tokens (stdlib), credential check
  (username case-insensitive, password case-sensitive), a DB username selected during setup, and
  a DB **password override** (salted PBKDF2 hash in application_settings) set by setup or
  `cli.py setpassword`. Database values beat `AUTH_USERNAME` / `AUTH_PASSWORD`.
  `main.py::require_authentication` middleware 401s every `/api/v1/*` route except health, login,
  and the guarded first-run setup endpoints. Frontend: `lib/auth.tsx`
  (`AuthProvider`/`useAuth`), `lib/api.ts` attaches the `Authorization: Bearer` header and fires a
  logout event on 401, `components/LoginScreen.tsx`, gate in `main.tsx`.
- **First-run setup.** `services/setup.py` owns the internal `setup_completed` flag. `seed_all`
  initializes it **before** default settings: false for an empty database and true for an existing
  installation, so upgrades never reopen setup. Public, single-use `/setup/*` endpoints set the
  username, password, and selected settings atomically; login is blocked while setup is incomplete.
  `pages/Setup.tsx` is the five-step `/setup` wizard and `main.tsx::FirstRunGate` chooses setup,
  login, or the authenticated app.
- **Factory reset.** `services/reset.py::reset_application` deletes child records before parents,
  clears all settings and DB credentials, then calls `seed_all` in the same transaction. The
  resulting database contains factory defaults with `setup_completed=false`. The authenticated
  `POST /data/reset-application` endpoint is called only after a dedicated Settings confirmation;
  on success the frontend clears authentication and performs a full navigation to `/setup`.

## API surface (`/api/v1`, see `routers/__init__.py`)
`setup` (status/complete/integration tests/model discovery), `auth` (login/me), `health`,
`changelog` (current/seen), `dashboard`,
`machines` (CRUD + `/duplicate` `/archive` `/unarchive` `/connectivity`
`/validate` `/hosts` `/tags` `/activity`), `tasks`, `reminders`, `services`, `storage`,
`network` (devices + segments), `dependencies`, `notes`, `task_templates`, `reminder_templates`,
`obsidian_templates` (+ `/preview` `/variables` `/{id}/reset`), `documents`
(`/generate` `/{id}` `/{id}/download`), `settings` (+ `/test-telegram`
`/restore-default-templates`), `data` (`/export` `/import` `/backup` `/clear-sample-data`
`/reset-application`).
Machine-scoped resources are nested under `/machines/{id}/…`. Helpers in `routers/helpers.py`
(`get_machine_or_404`, `resolve_tags`, `duplicate_warnings`).

## Frontend conventions (`frontend/src/`)
- **All data via TanStack Query** hooks in `lib/queries.ts`; the fetch wrapper is `lib/api.ts`
  (`api.get/post/put/patch/delete`, `downloadWithAuth`). Mutations invalidate through
  `useInvalidateMachine()`.
- **Design system** in `components/ui/` (Button, Card, Field, Badge, Progress, Dialog, Toast,
  State, Markdown, CopyButton, TimezoneSelect). **Never use raw `bg-white/[x]` / `black` overlays**
  — use the theme-aware tokens `surface(-2/-3)`, `fill`, `fill-hover`, `line`, `line-strong`,
  `border(-strong)`, `text/muted/faint`, `accent(-hover/-deep/-soft)`, `ok/warn/info(-soft)`.
  Tokens + light/dark values are defined in `index.css` (`@theme` + `:root[data-theme="light"]`);
  theme applied via `data-theme` on `<html>` (`lib/theme.ts`, inline script in `index.html`).
- **Machine create/edit** uses React Hook Form + Zod (`components/machine/schema.ts`); shared field
  groups in `MachineFields.tsx`; repeatable children edited via dialogs
  (`ServiceDialog`, `StorageDialog`, `NetworkDeviceDialog`, `NetworkSegmentDialog`, `DependencyDialog`).
  The wizard is `pages/new-machine/NewMachine.tsx`; detail tabs live in `pages/machine/`.
- Dates via `lib/utils.ts` formatters; Markdown sanitized with DOMPurify (`components/ui/Markdown.tsx`,
  `breaks: true` to match Obsidian).
- Routes: list/inventory at `/inventory`, detail at `/inventory/:id/:tab` (legacy `/machines/*`
  redirects). Sidebar/nav in `components/layout/Layout.tsx`.

## Migrations & extending
- Migrations in `backend/app/alembic/versions/` (head chain: initial → HOST → hypervisor+storage →
  NETWORK → reminders). **SQLite `CHECK`-constraint changes use `op.batch_alter_table`**
  (drop+recreate the named constraint). Always additive; test on a copy of `data/taskcentral.db`
  first. Env resolves the URL from app config (`alembic/env.py`).
- **Adding a machine type / field** touches many spots in lockstep: enum in
  `schemas/common.py`; model column/`CHECK`; a migration; `services/defaults.py`
  (templates/variables); `rendering.py` (context + labels + SAMPLE_CONTEXT); `routers/machines.py`
  (regex filter + create/duplicate/`_apply_fields` excludes); `data.py` (export/import field lists);
  and frontend `types.ts`, `utils.ts` labels, `MachineFields.tsx`, `MachineDetail.tsx` tabs,
  `NewMachine.tsx`, `TaskTemplates`/`ReminderTemplates` scope maps. Use the existing HOST/NETWORK
  additions as the reference pattern.
- **Settings** are added to `services/defaults.py::DEFAULT_SETTINGS`, `schemas/settings.py`
  (`SettingsOut` + `SettingsUpdate` with validation), and the Settings page. `seed_settings` is
  idempotent (adds missing keys on boot), so existing DBs pick up new settings automatically.

## Testing
- Backend: pytest in `backend/tests/` (conftest builds a tmp-file SQLite per test, seeds defaults,
  and the shared `client` fixture is **pre-authenticated** since the auth middleware guards all
  routes). ~56 tests cover machines, tasks, reminders, alerts, templates/docs, data, auth, misc.
- Frontend: vitest for `lib/utils` and `components/machine/schema` (`npx vitest run`).

## Gotchas
- Backend timestamps are stored UTC but serialized **without a `Z`** — the frontend re-adds it
  (`parseServerDate`) before converting to the app timezone. Don't "fix" the API to local time.
- The alert loop assumes a **single uvicorn worker** (compose runs one). Multiple workers would
  double-send.
- Data **import is a full replace**; exports intentionally omit `auth_password_hash`.
  `data.py::VALID_MACHINE_TYPES` is derived from `schemas.common.MachineType` so newly added
  machine types are not accidentally rejected by import validation. Custom 422 responses must
  include a human-readable `detail` in addition to the structured `errors` list.
- Data **reset is destructive and must never be exercised against a working database during
  tests or deployment verification**. Test `services/reset.py` only with an isolated temporary
  database; verify the live route through OpenAPI/route inspection without posting to it.
- JSON exports also omit the internal `setup_completed` flag. A missing flag on a database that
  already has settings, machines, or templates is treated as a completed legacy installation.
- `ApplicationSetting.value` is **JSON-encoded** — always `json.loads/dumps` when touching it.
- Release scripts are intentionally relocatable and resolve paths from their own directory. Never
  replace them with hard-coded `/taskcentral` paths.
- Release `.env` files contain generated secrets and must remain mode `0600`. Release bundles
  contain placeholders; only the tag workflow substitutes the real version, image prefix, and
  repository. `install.sh` refuses to run an unsubstituted source template.
- Updates must remain backup-first and pinned-version. `update.sh` pulls images before creating the
  backup/downtime window, then restores both the previous `.env` and database if health checks fail.
- Never add `data/`, `backups/`, `.env`, or a real database to release bundles or Docker contexts.
- A public release still requires a maintainer-selected `LICENSE`, and the published GHCR packages
  must allow anonymous pulls for the zero-login installer flow.
