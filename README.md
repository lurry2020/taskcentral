# Task Central

A self-hosted **homelab machine provisioning and documentation tracker**. Every time you spin up a
new VM, LXC container, or physical machine (Raspberry Pi, mini PC, NAS, server…), Task Central
gives you a consistent setup checklist, a place to record everything about the machine, and a
one-click Obsidian-ready Markdown document for your vault.

## Features

- **Machine records** for VMs, LXC containers, and physical machines with identity, network,
  OS, and hardware fields (type-aware: VMID for VM/LXC, inventory fields for physical).
- **Generated setup checklists** - creating a machine copies the applicable task templates
  (UniFi, Pi-hole DNS, Uptime Kuma, Homarr, Caddy, backups, validation, …) into independent
  per-machine tasks with statuses: Pending, In Progress, Completed, Blocked (reason required),
  Not Applicable (excluded from progress).
- **Task Templates** page - manage the default checklist per machine type; "Apply new defaults"
  adds missing template tasks to an existing machine with a preview and no duplicates.
- **Services & dependencies** - record what runs on each machine (name/port/protocol/URL) and
  what it depends on (other tracked machines or external systems), with reverse-dependency view.
- **Markdown notes** with preview, per machine and per task.
- **Obsidian document generation** - per-type Jinja templates (sandboxed), rendered with live
  machine data; copy to clipboard, download as `.md`, versioned snapshots, restore/view history.
  Task Central never writes to your vault - the workflow is copy/paste or download by design.
- **Dashboard** - summary cards, recent machines with progress, "needs attention" list.
- **History** - audit-style activity log per machine.
- **Data management** - full JSON export/import for every machine type (validated, with a
  record-count summary and specific validation errors), SQLite backup
  download, restore default templates, and a confirmed factory reset that deletes all data and
  credentials before returning the application to first-run setup.
- **Powerful machine list** - search, filters (type/host/tag/archived), sorting,
  pagination, duplicate/archive/delete with confirmations. Soft-delete via archive; hard delete
  only from the archive view.
- **First-run setup wizard** - creates the login username and password and configures general
  preferences, Telegram, and optional local AI before the first login.
- **Machine reachability** - machine detail headers ping the stored IP from the backend and show
  Online or Offline with manual refresh, hover details, and periodic checks.
- **Version-aware changelog** - after an update, the Dashboard shows the current release notes
  once automatically; the sidebar Changelog button reopens them at any time.

## Technology stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Backend    | Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic · Pydantic v2  |
| Templates  | Jinja2 (SandboxedEnvironment)                                 |
| Database   | SQLite (default) - PostgreSQL-ready via `DATABASE_URL`        |
| Frontend   | React 18 · TypeScript · Vite · Tailwind CSS v4                |
| Data/forms | TanStack Query · React Hook Form · Zod                        |
| Icons      | Lucide                                                        |
| Tests      | pytest (backend) · Vitest (frontend)                          |
| Deploy     | Docker Compose (nginx serving the SPA + proxying `/api`)      |

## Directory structure

```
/taskcentral
├── backend/
│   ├── app/
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── routers/       # API endpoints (/api/v1)
│   │   ├── services/      # seed data, checklist logic, Jinja rendering, defaults
│   │   ├── config.py      # environment-driven settings
│   │   ├── database.py    # engine/session
│   │   └── main.py        # FastAPI app
│   ├── alembic/           # migrations
│   ├── tests/             # pytest suite
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/    # UI primitives, layout, machine components
│   │   ├── pages/         # Dashboard, Machines, wizard, detail tabs, templates, settings
│   │   └── lib/           # API client, TanStack Query hooks, types, utils
│   ├── nginx.conf         # production proxy config
│   ├── package.json
│   └── Dockerfile
├── data/                  # SQLite database (persistent volume)
├── release/               # End-user Compose bundle and lifecycle scripts
├── CHANGELOG.md           # Versioned release notes shown inside the application
├── .github/workflows/     # CI and multi-architecture release publishing
├── VERSION                # Current application release
├── docker-compose.yml
├── .env.example
└── README.md
```

# Installation
## Dependencies
Make sure the following are installed:
- Docker Engine
- Docker Compose v2
- curl
- tar
---

## Install

```bash
mkdir taskcentral
cd taskcentral

taskcentral_version=$(curl -fsSL https://github.com/lurry2020/taskcentral/releases/latest/download/VERSION)

curl -fLO "https://github.com/lurry2020/taskcentral/releases/download/v${taskcentral_version}/taskcentral-${taskcentral_version}.tar.gz"

tar -xzf "taskcentral-${taskcentral_version}.tar.gz"
cd "taskcentral-${taskcentral_version}"

./install.sh
```

The installer asks for the port (default `8484`), generates unique secrets, creates persistent
`data/` and `backups/` directories, pulls pinned images, starts the application, and waits for
health checks. Open the printed URL and complete the one-time `/setup` wizard.

Release images support Linux `amd64` and `arm64`. Users do not need Git, Python, Node.js, or a
local compiler.

### Updates and maintenance

```bash
./update.sh                                      # newest release
./update.sh 1.2.3                                # specific release
./backup.sh                                      # consistent online SQLite backup
./restore.sh taskcentral-20260101-120000.db       # confirmed restore
./uninstall.sh                                   # preserve data and configuration
```

`./update.sh` also downloads and verifies the new release bundle, so Compose files, management
scripts, documentation, and container images update together. It creates a database backup before
downtime and verifies both health checks. A failed update automatically restores the previous
release files, version, and database.

## Updating

```bash
cd taskcentral/taskcentral-{version}
#example: cd taskcentral/taskcentral-1.1.2

./update.sh
```

After a successful update, the Dashboard presents the current version's changelog once.
Already-open tabs detect the new running version and display **Reload Task Central**. HTML entry
responses are not cached, so a normal reload is sufficient; a hard refresh is not required.

See the README inside the release bundle for full operational instructions.

## Source quick start

Developers and source-based deployments can still build locally:

```bash
cd /taskcentral
cp .env.example .env
docker compose up -d --build
```

Open **http://localhost:8484**. Change the port with `APP_PORT` in `.env`.

- The SQLite database lives in `./data/taskcentral.db` (bind-mounted volume).
- Migrations run automatically when the backend container starts.
- Default task templates, Obsidian templates, and settings are seeded on first start.
- Set `DEMO_MODE=true` before the first start to seed a few sample machines
  (tagged `#sample-data`; remove them later via Settings → Clear sample data).

## Local development

Backend (Python 3.11+):

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head          # creates ../data/taskcentral.db
uvicorn app.main:app --reload # http://localhost:8000, docs at /docs
```

Frontend:

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173, proxies /api to :8000
```

### Tests and checks

```bash
cd backend  && .venv/bin/python -m pytest tests   # backend tests
cd frontend && npm test                            # vitest
cd frontend && npm run typecheck                   # tsc
cd frontend && npm run build                       # production build
```

## Environment variables

| Variable       | Default                          | Description                                     |
| -------------- | -------------------------------- | ----------------------------------------------- |
| `APP_NAME`     | `Task Central`                   | Display name (also editable in Settings)        |
| `APP_ENV`      | `production`                     | Environment label                               |
| `APP_PORT`     | `8484`                           | Host port for the web UI                        |
| `TASKCENTRAL_VERSION` | `1.1.4`                    | Installed application release                   |
| `TASKCENTRAL_RELEASE_REPOSITORY` | `lurry2020/taskcentral` | Repository used to check for releases   |
| `DATABASE_URL` | `sqlite:////data/taskcentral.db` | SQLAlchemy connection string                    |
| `CORS_ORIGINS` | `http://localhost:8484`          | Comma-separated allowed origins                 |
| `LOG_LEVEL`    | `INFO`                           | Backend log level                               |
| `LOG_MAX_BYTES` | `5242880`                       | Size at which each local log file rotates       |
| `LOG_BACKUP_COUNT` | `5`                          | Number of older local log files retained        |
| `SECRET_KEY`   | `change-me`                      | Reserved for future auth; set something random  |
| `DATA_DIR`     | `/data`                          | Data directory inside the backend container     |
| `DEMO_MODE`    | `false`                          | Seed sample machines on first start             |

## Database migrations

Migrations are managed with Alembic and run automatically on container start.
Manual usage:

```bash
cd backend
.venv/bin/alembic upgrade head                     # apply
.venv/bin/alembic revision --autogenerate -m "..." # create after model changes
.venv/bin/alembic downgrade -1                     # roll back one revision
```

### Switching to PostgreSQL

1. Add `psycopg[binary]` to `backend/requirements.txt` and rebuild.
2. Set `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/taskcentral`.
3. Start the stack - Alembic creates the schema on the empty database.
4. Move data by exporting JSON from the SQLite instance (Settings → Export) and importing it
   into the new instance.

## Backup & restore

**Backup** (any of):

- Settings → **Download database backup** (SQLite file), or
- Settings → **Export all data (JSON)** (portable across database engines), or
- Stop the stack and copy `./data/taskcentral.db`.

**Restore**:

- JSON: Settings → **Import from JSON…** - the file is validated first, you see a summary, and
  the import **replaces all current data**.
- SQLite file: stop the stack, replace `./data/taskcentral.db`, start again.

**Factory reset**:

- Settings → Data Management → **Reset Application** permanently deletes all application data,
  settings, and login credentials, restores factory defaults, signs out, and opens `/setup`.
  This cannot be undone; download a database backup first.


## Authentication

Task Central requires a login. It's a single user:

- On a new database, `/setup` requires a username and a password of at least 6 characters, then
  stores the username and salted PBKDF2 password hash. Setup also collects timezone/date format
  and optionally Telegram and local-AI settings. Skipped integrations can be configured later.
- The setup-selected username and password override the `AUTH_USERNAME` / `AUTH_PASSWORD`
  fallbacks. The **username is matched case-insensitively; the password is case-sensitive.**
- Logging in issues an HMAC-signed session token (valid for `AUTH_TOKEN_TTL_HOURS`, default 7
  days) that the browser sends on every API request. Health, login, and guarded first-run setup
  endpoints are public; setup mutations stop working after setup completion.
- Sign out from the sidebar footer (or the header on mobile).

Existing databases are automatically marked as already configured during upgrade. They do not
show `/setup`, and their password and application preferences are not overwritten.

### Reset / change the password from the CLI

If you forget the password (and have host access), reset it with:

```bash
docker compose exec backend python -m app.cli setpassword
# or non-interactively:
docker compose exec backend python -m app.cli setpassword 'NewPassw0rd!'
# revert to the AUTH_PASSWORD env value:
docker compose exec backend python -m app.cli setpassword --reset
```

The new password is stored (salted PBKDF2 hash) in the database and takes effect immediately for
new logins - no restart needed. It overrides `AUTH_PASSWORD` until you `--reset`. The hash is
never included in JSON data exports. Both forms preserve the username selected during setup;
`--reset` clears only the stored password override.

## Security considerations

- **Login is enabled** (see above), but the SPA is still a client-side app: keep the instance on
  a private homelab network behind your firewall/VPN or an authenticating reverse proxy, and add
  HTTPS if you ever expose it. Set a strong random **`SECRET_KEY`** - it signs the session tokens.
- Obsidian templates render in a **sandboxed** Jinja environment - no arbitrary Python.
- Markdown is sanitized (DOMPurify) before rendering in the UI.
- Generated filenames are sanitized against path traversal; import size is limited (20 MB).

## How Obsidian templates work

Each machine type (VM / LXC / Physical) has one template, editable under **Obsidian
Templates**. Generating a document on a machine's **Obsidian** tab renders the template with
that machine's current data and stores a snapshot (versioned; old versions stay viewable).
Copy the result to your clipboard or download it as `machine-name.md` and drop it into your
vault - Task Central intentionally never writes to the vault itself.

Template syntax is Jinja:

```jinja
{% if machine.vmid %}
VMID: {{ machine.vmid }}
{% endif %}

{% for service in services %}
- {{ service.name }}{% if service.port %}: {{ service.port }}{% endif %}
{% endfor %}
```

### Available template variables

`machine.*`: `name`, `machine_type`, `host`, `vmid`, `ip_address`, `mac_address`,
`dns_record`, `operating_system`, `operating_system_version`, `architecture`, `status`,
`purpose`, `tags` (list), `cpu`, `cpu_cores`, `memory` ("8 GB"), `disk`, `storage_location`,
`gpu`, `network_interface`, `hardware_model`, `serial_number`, `asset_tag`, `location`,
`owner`, `created_at`, `deployment_date`, `notes` (machine notes joined as Markdown).

Lists: `services` (name, description, port, protocol, url, is_external, notes),
`dependencies` (name, dependency_type, notes, is_external), `checklist` (title, status,
category, required, notes, completed_at), `completed_tasks`, `pending_tasks`. Plus `now`.

Settings control whether the checklist / completed tasks / not-applicable tasks are included.
The full list with descriptions (and copy buttons) is shown next to the template editor.

## How task templates work

Task templates define the default checklist. Each has a machine-type scope (All / VM / LXC /
Physical), category, required flag, enabled flag, and sort order. When a machine is created,
all **enabled** templates matching its type are **copied** into independent machine tasks -
editing or deleting a template later never changes existing machines. To pull new defaults
into an existing machine, use **Apply new defaults** on its checklist tab: it previews exactly
which tasks would be added and skips anything already present.

## Troubleshooting

Task Central keeps persistent, host-readable diagnostics in the project directory:

```bash
tail -n 200 logs/taskcentral.log
tail -n 200 logs/frontend.log
```

`taskcentral.log` records backend startup, application errors, integration failures, and failed
API requests. `frontend.log` records nginx and reverse-proxy errors. Logs rotate at 5 MiB by
default and keep five older numbered files. Change `LOG_MAX_BYTES` or `LOG_BACKUP_COUNT` in
`.env` if needed. Task Central does not intentionally log passwords, API keys, authentication
headers, chat prompts, or model response bodies.

| Symptom                          | Fix                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Port 8484 already in use         | Set `APP_PORT` in `.env` and `docker compose up -d`                                      |
| `502` from the frontend          | Check `logs/frontend.log`, then `logs/taskcentral.log`                                   |
| Database locked errors           | SQLite dislikes concurrent writers; this app is single-user - check for stray processes  |
| Import rejected                  | The JSON must come from Settings → Export (`"format": "taskcentral-export"`)             |
| Template error when generating   | The template failed to render - the error message names the line; Reset to default helps |
| Frontend dev server API errors   | Ensure `uvicorn` runs on :8000, or set `VITE_API_PROXY`                                  |

## API

The full REST API is served under `/api/v1` with interactive OpenAPI docs at
`http://localhost:8484/api/docs` in Docker (or `http://localhost:8000/docs` in dev).
Health check: `GET /api/v1/health`.
