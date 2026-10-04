# Phase 0 – Projektgrundlage

**Stand:** abgeschlossen (2026-10-04)

| Aufgabe | Umsetzung |
| --- | --- |
| pnpm Workspace, Turbo, TypeScript | `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` |
| ESLint | Flat-Config `eslint.config.mjs` (typescript-eslint + eslint-config-prettier); `pnpm lint` lintet das ganze Repo |
| Prettier | `.prettierrc`, `pnpm format` |
| Docker Compose, PostgreSQL, Redis | `docker-compose.yml`; ohne Docker lokale Binaries via `scripts/dev-setup.mjs` |
| Environment | `.env.example`, automatische `.env`-Erzeugung |
| Gemeinsame Packages | `packages/*` |
| Startbar: Bot, API, Dashboard, Worker | `pnpm dev` |

## Abnahme (praktisch geprüft)
`pnpm dev` startete PostgreSQL, Redis, API (`/docs` 200), Dashboard (200), Worker (Redis-Verbindung, BullMQ-Scheduler) und Bot (klarer Fehler ohne `DISCORD_TOKEN`).

## Dabei behoben
- API startete nicht (DI-Fehler: `AuthModule` konnte `GuildService` nicht auflösen) → `AuthModule` importiert `GuildModule`.
- `lint` war ein Platzhalter (`echo no-lint-yet`) und die ESLint-Config ungültig → echte Konfiguration.

## Bekannte Grenzen
- Docker-Pfad (`docker compose up`) ist hier nicht ausgeführt, da Docker nicht installiert ist.
- Der Worker führt bisher nur einen Heartbeat aus; fachliche Jobs folgen in Phase 31.
- Bot gegen echtes Discord erst mit gültigem Token testbar.
