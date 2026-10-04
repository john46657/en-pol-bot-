# NEXUS

Discord-Plattform für Polizei-RP: Bot (discord.js), API (NestJS), Dashboard (Vite + React), Worker (BullMQ), PostgreSQL (Prisma), Redis.

## Schnellstart

```bash
pnpm install
pnpm dev        # startet PostgreSQL + Redis, wendet das Schema an, startet Bot, API, Dashboard, Worker
```

`pnpm dev` ruft zuerst `scripts/dev-setup.mjs` auf:

1. legt `.env` aus `.env.example` an (mit generiertem `AUTH_SECRET`),
2. startet PostgreSQL + Redis – über `docker compose`, falls Docker läuft, sonst über lokal installierte Binaries (`brew install postgresql@17 redis`, Daten in `.dev/`),
3. wendet Migrationen an (solange es keine gibt: `prisma db push`).

Danach laufen: API <http://localhost:3000/api/v1> (Docs: `/docs`), Dashboard <http://localhost:3001>, Worker, Bot.
Der Bot braucht `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` in `.env` ([docs/BOT-SETUP.md](docs/BOT-SETUP.md)); ohne sie meldet er einen klaren Fehler, die übrigen Dienste laufen weiter.

`pnpm dev:stop` stoppt lokal gestartete Dienste (Docker: `docker compose down`).

## Befehle

| Befehl                          | Zweck                                |
| ------------------------------- | ------------------------------------ |
| `pnpm lint`                     | ESLint (typescript-eslint, Prettier) |
| `pnpm typecheck`                | `tsc --noEmit` in allen Paketen      |
| `pnpm build` / `pnpm test`      | Turbo-Pipelines                      |
| `pnpm format`                   | Prettier                             |
| `pnpm db:migrate:dev` / `db:push` | Prisma                             |

## Struktur

`apps/{api,bot,dashboard,worker}`, gemeinsame Pakete unter `packages/*` (`config`, `core`, `database`, `discord`, `permissions`, `types`, `validation`, …).
Die Entwicklung läuft phasenweise; Stand und Doku je Phase: [docs/phasen](docs/phasen).
