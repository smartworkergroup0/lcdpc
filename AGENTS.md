# AGENTS

High-signal guidance for OpenCode sessions in this repo.

## What is actually here

- Monorepo with three real work areas:
  - `api/` — Go backend, PASETO v2.local auth, pgx + PostgreSQL.
  - `web/` — Angular 20 standalone app with signals, PrimeNG 20, SCSS, pnpm.
  - `docs/` — architecture + SDD artifacts that drive feature work.

## Load these files

Before working on any code, also load the domain-specific guidance:

- **`backend.md`** — all backend rules (Go, auth, RBAC, handlers, data access, migrations, branch scoping).
- **`frontend.md`** — all frontend rules (Angular, PrimeNG, components, stores, dialogs, look & feel).
- **`sync.md`** — sync endpoints (API Key auth, products/bundles batch upsert, chain stock, image upload).

## Fast commands

- Backend with Docker (recommended when auth/db matters):
  - `cd api && cp .env.example .env && docker compose up --build`
- Backend local:
  - `cd api && go run main/main.go`
- Backend tests:
  - `cd api && go test ./...`
- Backend build:
  - `cd api && go build -o server main/main.go`
- Frontend:
  - `cd web && pnpm install`
  - `cd web && pnpm start`
  - `cd web && pnpm test`
  - `cd web && pnpm build`

## Read these before editing

- `README.md` — repo entrypoint and env vars.
- `docs/backend/architecture/fase-1-blueprint.md` — authoritative layer rules.
- `docs/sdd/README.md` + matching `docs/sdd/changes/<change>/` artifacts — required before feature work; update the tasks checklist after implementation.
- `/.agents/skills/primeng/SKILL.md` — load this before PrimeNG/UI work.
- `/.agents/skills/golang/SKILL.md` — load this before Go backend work.

## Repo gotchas

- No `.github/` workflows are present; do not invent CI expectations.
- `docs/` contains SDD artifacts; read them before feature work.
- `go_plan_finalized.md` contains the migration analysis (C# vs Go trade-offs).
