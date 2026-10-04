# Phase 2 – Discord Bot Core

**Stand:** Code und Tests abgeschlossen (2026-10-04); **Live-Test gegen echtes Discord steht aus** (kein Token vorhanden).

## Bereits vorhanden (vor dieser Phase)
Login, `Ready`, `GuildCreate/Update`, Interaction-Router, Slash-Commands `/panel`, `/nexus`, Button-/Modal-Handler der Bewerbung, Fehlerbehandlung je Interaction, klare Startfehler.

## Neu
| Baustein | Datei |
| --- | --- |
| Guild Leave (`GuildDelete` → `leftAt`, ignoriert Discord-Ausfälle) | `src/bot.ts` |
| Shard-/Warn-Events, `unhandledRejection`/`uncaughtException` | `src/bot.ts`, `src/index.ts` |
| Slash-Command-Grundstruktur (`defineCommand`) | `src/commands/registry.ts` |
| Button-/Select-/Modal-Registry (`registerButton/Select/Modal`) | `src/core/interaction-registry.ts` |
| Role Service (inkl. Hierarchie: 🟢/🔴 `botCanManage` mit Grund) | `src/services/role.service.ts` |
| Channel Service (Text/Voice/Kategorie, ohne Threads) | `src/services/channel.service.ts` |
| Member Service (Einzelabruf, Suche, Zähler – nie Komplett-Fetch) | `src/services/member.service.ts` |
| Guild-Info Service | `src/services/guild-info.service.ts` |
| Permission Service (Discord-Admin oder zugeordnete Rolle aus `permissions`) | `src/services/permission.service.ts` |
| Embed Builder (Farben je Art, Discord-Limits werden gekürzt) | `src/core/embed-builder.ts` |
| `/server info\|rollen\|kanaele\|mitglieder` (Server-Verwalter) | `src/commands/server.ts` |
| `/diagnose` – Live-Roundtrip für Button, Select, Modal (Administratoren) | `src/commands/diagnose.ts` |

Der „Discord API Service" ist `packages/discord` (REST-Gateway mit Cache) für die API; der Bot nutzt discord.js direkt (Cache des Gateways, keine zusätzlichen API-Aufrufe).

## Behoben
`parseCustomId` erkannte keine Aktionen mit Doppelpunkt (`panel:start`, `dm:cancel`, …): **kein Button der Bewerbung wurde je verarbeitet**. Parsing prüft jetzt gegen bekannte und registrierte Aktionen (Regressionstest).

## Tests
`pnpm --filter @nexus/bot test` (14 Tests): Rollenhierarchie (verwaltbar, gleiche Position, fehlendes Recht, Integrationsrolle, @everyone), Kanalklassifizierung, Guild-Info, Permission-Logik, Embed-Limits, Registry für Button/Select/Modal, Custom-ID-Parsing. Services laufen gegen Guild-Attrappen, nicht gegen echtes Discord.

## Live-Abnahme (sobald `DISCORD_TOKEN` gesetzt ist)
Bot einladen → `/server info`, `/server rollen`, `/server kanaele`, `/server mitglieder suche:…` → `/diagnose` und Button, Select, Modal auslösen → Bot vom Server entfernen, in der DB wird `guilds.leftAt` gesetzt.
