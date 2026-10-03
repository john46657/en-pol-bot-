# Phase 1 – Datenbank & Grundarchitektur

**Stand:** abgeschlossen (2026-10-04)

## Modelle (`packages/database/prisma/schema.prisma`)
| Modell | Zweck |
| --- | --- |
| `Guild` | Server (ID = Discord-Snowflake); `leftAt` markiert verlassene Server, Daten bleiben |
| `GuildSettings` | 1:1 zur Guild: Sprache, Zeitzone, Log-Kanal, `data` (JSON für Module) |
| `User` | Discord-Benutzer (global) |
| `DiscordRole`, `DiscordChannel` | gespiegelter Discord-Stand; `discordId` nur je Guild eindeutig; fehlende Einträge werden per Soft Delete (`deletedAt`) markiert |
| `Permission` | Permission-Key → Rolle (n:m über Zeilen); Grundlage für Phase 6 |
| `AuditLog` | angehängtes Log: Akteur, Aktion, Ressource, `before`/`after` |

Die Bewerbungsmodelle (Phase 8) existieren bereits und bleiben unverändert.

## Migrationen & Seed
- Baseline `prisma/migrations/20261004000000_init`. `pnpm dev` wendet sie über `migrate deploy` an.
- Neue Änderungen: `pnpm db:migrate:dev`.
- Seed: `pnpm --filter @nexus/database prisma:seed` (idempotent, Demo-Server `900000000000000001`).

## Repository-Schicht (`packages/database/src/repositories`)
`guildRepository`, `userRepository`, `discordSyncRepository`, `permissionRepository`, `auditRepository`.
Jede guild-gebundene Funktion verlangt eine `guildId` (`assertGuildId`, Fehler `GuildContextError`), Permission-Zuordnungen akzeptieren nur Rollen derselben Guild, `auditRepository` bietet kein Update/Delete. Der Bot nutzt `guildRepository.upsert` für den Guild-Sync.

## Tests
`pnpm --filter @nexus/database test` – Integrationstests gegen eine eigene Datenbank `nexus_test` (wird automatisch angelegt, Migrationen per `migrate deploy`). Sie decken die fünf Abnahmepunkte, Guild-Isolation und Leave/Rejoin ab.

## Grenzen
- Die Migration wurde nicht per `migrate dev` erzeugt, sondern per `migrate diff` und auf der Dev-DB als angewendet markiert (Prisma blockiert `migrate reset` für KI-Aktionen). Auf einer frischen DB läuft sie fehlerfrei (`nexus_test`).
- Der Audit-Log ist per Code, noch nicht per DB-Trigger unveränderlich.
- Mitglieder-Zuordnung (User ↔ Guild) folgt mit Phase 2/3.
