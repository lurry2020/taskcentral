# Task Central — Implementation Notes

Homelab machine provisioning & documentation tracker. Single-user, self-hosted.

## Stack
- Backend: FastAPI (Python), SQLAlchemy 2.x, Alembic, Pydantic v2, sandboxed Jinja2
- Frontend: React + TypeScript + Vite, Tailwind CSS, TanStack Query, React Hook Form + Zod, Lucide icons
- DB: SQLite (swap to PostgreSQL via DATABASE_URL)
- Deploy: Docker Compose (frontend nginx :8484 proxies /api to backend :8000)

## Plan
1. Backend models + Alembic migration (machines, tags, services, dependencies,
   notes, task_templates, machine_tasks, obsidian_templates, generated_documents,
   activity_events, application_settings)
2. Seed system (default task templates, 3 Obsidian templates, settings)
3. REST API under /api/v1 (machines CRUD + duplicate/archive, tasks, services,
   dependencies, notes, templates, documents, dashboard stats, settings,
   export/import, health)
4. Frontend design system (dark charcoal + red accent) and layout
5. Pages: Dashboard, Machines, New Machine wizard, Machine Detail (tabs),
   Task Templates, Obsidian Templates, Settings
6. Docker Compose + README
7. Tests (pytest + vitest), typecheck, build, end-to-end verification

## Decisions
- Integer PKs; created_at/updated_at everywhere; archived_at on machines (soft delete).
- Task template scope: ALL | VM | LXC | PHYSICAL (single scope per template row).
- Machine tasks are independent copies of templates at creation time.
- `machine.notes` template variable = machine notes joined as markdown sections.
- Obsidian rendering uses jinja2.sandbox.SandboxedEnvironment.
- No auth; document network-level protection (Caddy/access proxy).
