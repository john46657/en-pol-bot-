# Test guide

```bash
pnpm install
pnpm dev:all        # DB + migrations + seed + demo data + API + web, one command (Ctrl+C stops everything)
```
Open **http://localhost:5173**. API docs: http://localhost:3000/api/docs. Demo data is created through the real API (so audit, timeline and notifications exist) and only when it isn't there yet. Reset everything: stop, delete `apps/api/.pgdata`, start again. Dev only — never run against production (`scripts/demo-data.mjs` refuses `NODE_ENV=production`).

## Accounts
| User | Password | Roles | Good for testing |
|---|---|---|---|
| `admin` | `Admin-Demo-123456` | System Administrator | everything: Admin, Studio, ER:LC, audit |
| `dispatcher` | `Demo-Pass-123456` | Police Member + Dispatch | Dispatch board, incidents |
| `officer1` | `Demo-Pass-123456` | Police Member | MDT, tickets, reports, complaints |
| `officer2` | `Demo-Pass-123456` | + Senior Officer | wanted, evidence transfer |
| `supervisor` | `Demo-Pass-123456` | + Supervisor | Team dashboard, report review, ticket void, wanted clear |
| `detective` | `Demo-Pass-123456` | + Investigator | investigations, evidence, complaint investigation |
| `hrmanager` | `Demo-Pass-123456` | + Police Administration | personnel, applications, analytics |
| `trainer` | `Demo-Pass-123456` | + Training Staff | academy |

## Things to try
1. **MDT** (`/mdt`) as `officer1`: search `LC 1001`, `Alex_Racer`, `7000001`; use *Create Ticket*, *Create Report*. Notice that *Create Investigation/Wanted* do not appear.
2. **Dispatch** (`/dispatch`) as `dispatcher`: create an incident, assign `ADAM-1`/`BRAVO-2`, step the status. Open a second browser window as `supervisor` — the board updates live.
3. **Team dashboard** (`/team`) as `supervisor`: see who is on duty, their unit and current incident; change someone's duty status or unit. Log in as `officer1` — no such controls.
4. **Reports**: `officer1` submits → `supervisor` starts review → approve/reject (reject needs a reason; you can't review your own).
5. **Complaints**: `officer1` files one → `admin` screens/assigns → `detective` investigates (internal notes hidden from others).
6. **Permissions**: *Admin → Roles & Permissions* (cycle ALLOW/DENY), *Admin → Users* (individual overrides: DENY beats a role ALLOW). Log in as that user in a private window to see the effect.
7. **Studio** (`/admin/studio`): add a required custom field to persons, then create a person.
8. **Public application**: `/apply` (no login), then review under *Applications* as `hrmanager`.
9. **Audit** (`/admin/audit`): every action above is there; entries cannot be edited or deleted.

Automated: `pnpm test` (unit + integration), `pnpm e2e` (browser).

## Discord-Bot testen
Siehe [discord-bot.md](discord-bot.md). Kurz: Bot im Developer Portal anlegen, dann
`DISCORD_TOKEN=… DISCORD_GUILD_ID=… pnpm dev:all`, im Web (Chat-Symbol oben rechts) „Mit Discord verknüpfen“, danach `/person`, `/dienst an`, `/einsatz` ausprobieren. Kanal-IDs unter *Admin → Settings* setzen und im Web einen Einsatz anlegen → Nachricht erscheint im Dispatch-Kanal.
