# ENRP NEXUS

Police CAD / MDT / Dispatch for Emergency Response: Liberty County (Roblox). Police and dispatch only.
Stack: NestJS 11 · Prisma 6 · PostgreSQL · React 19 · Vite · Tailwind 4 · TanStack Query · Socket.IO.

> **Not included (removed on purpose, for now):** the ER:LC API connector/webhooks and Galaxy AI. The code is archived in `../enrp-nexus-removed-erlc-galaxy.tar.gz`; see [docs/extending.md](docs/extending.md#re-adding-integrations). Docs: [docs/](docs).

## Quick start (test everything with one command)
```bash
pnpm install
pnpm dev:all     # embedded PostgreSQL + migrations + seed + demo data + API :3000 + web :5173
```
Then open http://localhost:5173 — accounts and a click-through test plan are in [docs/test-guide.md](docs/test-guide.md). Adding features: [docs/extending.md](docs/extending.md).

Manual steps / checks:
```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
pnpm e2e         # Playwright (uses installed Google Chrome)
```

## Status
| Area | State |
|---|---|
| Auth, sessions, lockout, login history, security events | done |
| RBAC (central resolver, user DENY/ALLOW overrides, groups, wildcards), Roblox ID (manual) | done |
| Persons (+merge), Vehicles, Tickets, Legal codes | done |
| Dispatch/Incidents/Units, Reports (versioned), Complaints, Investigations, Wanted, Evidence (custody) | done |
| Personnel, Duty, Applications, Academy, Communication, Notifications, Search, Analytics | done (see docs for limits) |
| Audit (append-only, DB trigger) + Timeline, Exports (CSV/JSON/PDF), Media upload, Settings, Retention | done |
| WebSockets (authorized rooms) | done |
| React UI: shell, search, notifications, dashboard (customizable), dispatch board, all record lists/details, admin | done |
| Hosting on a VPS (Docker Compose + Caddy HTTPS + daily DB backups + setup/update/restore scripts): [docs/deployment.md](docs/deployment.md) | written; production artifact tested locally, **Docker itself not run** |
| MDT portal, Team dashboard (supervisor actions), one-command dev start with demo data | done |
| Browser E2E tests (10 specs), public application page `/apply` | done |
| Studio: custom fields (persons/vehicles), accent theme, application form ([docs/studio.md](docs/studio.md)) | done |
| Studio workflows, configurable priorities, virtualized tables, record locking, 2FA | **not implemented** |
