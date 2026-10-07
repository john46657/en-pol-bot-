# EN Polizei

> 🤖 **Panel-Start aus `main` (API + Web + Bot):** Startdatei `start.js` – startet das fertige Paket aus `hosting/` (erzeugt mit `pnpm bundle:hosting`, nicht von Hand ändern). Anleitung: [HOSTING-ANLEITUNG.md](HOSTING-ANLEITUNG.md).
>
> 🤖 **Nur der Bot:** `bot.py` + `bot.js` im Hauptverzeichnis sind der fertig gebaute Discord-Bot (`bot.js` wird aus `apps/bot` mit `pnpm bundle:bot` erzeugt – nicht von Hand ändern). Startbefehl: `python3 bot.py` oder `node bot.js`; Einstellungen in einer `.env` (Vorlage: `apps/bot`-Doku in [docs/discord-bot.md](docs/discord-bot.md)).

> 📦 **Der frühere Python-Bot** (Emden RP Bot) ist entfernt (Git-Historie); seine Funktionen sind portiert. Übersicht: [docs/migration-vom-alten-bot.md](docs/migration-vom-alten-bot.md).

Police CAD / MDT / Dispatch for Emergency Response: Liberty County (Roblox). Police and dispatch only.
Stack: NestJS 11 · Prisma 6 · PostgreSQL · React 19 · Vite · Tailwind 4 · TanStack Query · Socket.IO.

> **ER:LC-Integration + CAD-Leitstelle** (Server-Key verschlüsselt im Backend, Live-Daten, Notrufe, Karte, Command Center, Cross-Server Leitstelle ↔ SEK/K9): [docs/cad.md](docs/cad.md). Galaxy AI is not included. Docs: [docs/](docs).

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
| Personnel, Duty, Applications, SEK special unit ([docs/sek.md](docs/sek.md)), Qualifications ([docs/qualifications.md](docs/qualifications.md)), Academy, Communication, Notifications, Search, Analytics | done (see docs for limits) |
| Audit (append-only, DB trigger) + Timeline, Exports (CSV/JSON/PDF), Media upload, Settings, Retention | done |
| WebSockets (authorized rooms) | done |
| React UI: shell, search, notifications, dashboard (customizable), dispatch board, all record lists/details, admin | done |
| Panel hosting package (`pnpm bundle:hosting` → one ZIP with API + web + bot, e.g. for bot-hosting.net): [docs/hosting-bot-hosting.md](docs/hosting-bot-hosting.md) | package simulated locally (install → start → login); **real panel untested** |
| Hosting on a VPS (Docker Compose + Caddy HTTPS + daily DB backups + setup/update/restore scripts): [docs/deployment.md](docs/deployment.md) | written; production artifact tested locally, **Docker itself not run** |
| Discord bot (`apps/bot`): 36 slash commands (lookups, duty + duty hours, SEK roster/reports, application + qualification panels with step-by-step DM questions (police, SEK, Flugstaffel, Ausbilder), dispatch, create ticket/report/complaint/investigation/wanted/evidence, decision DMs, danger-level button panel, self-updating team list, radio whitelist, Roblox lookup) with the linked user's permissions, channel notifications via outbox, one-time-code linking ([docs/discord-bot.md](docs/discord-bot.md)) | done; **not tested against real Discord** |
| Standalone bot package (`pnpm bundle:bot` → single self-contained `bot.js` + source) | done; loads without node_modules (verified), **real Discord untested** |
| MDT portal, Team dashboard (supervisor actions), one-command dev start with demo data | done |
| Browser E2E tests (10 specs), public application page `/apply` | done |
| Support ticket system for Discord, fully configured in the dashboard (panel builder with preview, categories, questions, buttons, roles, statuses, priorities, close reasons, transcripts, ratings, statistics, auto-close/-delete, internal notes, `ticket.*` permissions): [docs/support-tickets.md](docs/support-tickets.md) | done; **not tested against real Discord** |
| Studio: custom fields (persons/vehicles), accent theme, application form ([docs/studio.md](docs/studio.md)) | done |
| Dashboard: Discord-Rollen laufend geprüft, Rollen-Hierarchie/-Editor/Matrix, Bereichsrechte, Server getrennt, persönliches Design + Widgets + Layouts, Teamliste (≥ 60 s) und Voice-Widget getrennt, automatisches Speichern: [docs/dashboard.md](docs/dashboard.md) | done; **Teamliste/Voice nicht gegen echtes Discord getestet** |
| CAD-Leitstelle + ER:LC (`/cad`): Einsätze, Einheiten, Notrufe → Einsatz, Funk-Chronik, interaktive Karte mit Layern/POIs/Zonen, ER:LC Live, Command Center, Teamübersicht, Cross-Server, konfigurierbare Prioritäten/Status/Kanäle, `cad.*`-Rechte: [docs/cad.md](docs/cad.md) | done; **nicht gegen echten ER:LC-Server/Discord getestet** |
| Abmeldungen wie Trident (`/leave manage`, Dauer 6h/4d/2w, Annehmen/Ablehnen mit Grund, DMs) · Gefahrenstatus Status 1–4 (Texte/Farben/Ping einstellbar) · Bewerbungs-Statistik | done |
| Studio workflows, virtualized tables, record locking, 2FA | **not implemented** |
