# Phase 3 – Discord-Synchronisierung

**Stand:** Code, Tests und API-Ende-zu-Ende gegen einen Fake-Discord abgeschlossen (2026-10-04). **Dashboard-UI und Bot-Sync sind nicht gegen echtes Discord/Browser-Login getestet.**

## Bot → Datenbank (`apps/bot/src/sync/discord-sync.ts`)
Rollen, Kanäle (Text, Voice, Kategorien) und Benutzer werden beim Start und bei `GuildCreate` gespiegelt, danach event-getrieben (Rollen-/Kanal-Create/Update/Delete, gebündelt über 2 s; `GuildMemberAdd` für Benutzer). Quelle ist der Gateway-Cache – keine zusätzlichen REST-Aufrufe. Benutzer werden nur bei Servern bis `NEXUS_MEMBER_SYNC_LIMIT` (Standard 1000) vollständig geladen. Auf Discord gelöschte Einträge werden per Soft Delete markiert.

## API (`apps/api/src/modules/guild`)
| Endpunkt | Recht | Zweck |
| --- | --- | --- |
| `GET /guilds/:id/discord/roles` | `applications.view` | Rollen live aus Discord inkl. `manageable` + Grund (Hierarchie, „Rollen verwalten“, Integrationsrolle, @everyone) |
| `GET /guilds/:id/discord/channels?kind=text\|voice\|category` | `applications.view` | Kanäle nach Art |
| `GET /guilds/:id/discord/bot-permissions` | `applications.view` | Bot-Rechte: Kanäle ansehen, Nachrichten senden, Links einbetten, Rollen verwalten |
| `GET /guilds/:id/selections` | `applications.view` | Konfigurierbare Felder + aktueller Wert |
| `PUT /guilds/:id/selections/:slot` | `applications.manage` | Auswahl speichern/löschen (`value: null`) |

Beim Speichern wird **serverseitig** gegen Discord geprüft: Rolle/Kanal existiert, Kanaltyp passt zum Feld, Rolle ist für Felder, die der Bot vergibt, verwaltbar. Jede Änderung landet mit alt/neu im `AuditLog`. Die Auswahlen liegen in `GuildSettings.data.selections` (transaktional, parallele Änderungen gehen nicht verloren). Felder sind in `selection-slots.ts` definiert; spätere Phasen ergänzen ihre eigenen.

**Behoben:** Die bisherige Verwaltbarkeits-Prüfung verglich das Rechte-Bitfeld mit genau einem Bit (`perms === MANAGE_ROLES`) und war damit für fast jeden realen Bot falsch. Jetzt werden alle Bot-Rollen und @everyone verodert.

## Dashboard
`/guilds/:id/settings`: Dropdowns für Rolle, Text-/Voice-Kanal und Kategorie aus Discord (keine ID-Eingabe), 🟢/🔴 pro Rolle, Bot-Rechte-Check, Warnung bei gelöschter Auswahl.

## Tests
- `apps/api` (10): Hierarchie, Bot-Rechte, Administrator-Sonderfall, Validierung und Audit der Auswahlen.
- `apps/bot` (+3): Sync-Mapping, Filter, Mitgliederlimit.
- `packages/database` (+2): Auswahlen speichern/löschen, parallele Schreibzugriffe.
- Praxistest: API mit Fake-Discord (`scripts/fake-discord.mjs`, `DISCORD_API_BASE`) – Rollen/Kanäle/Rechte lesen, gültige und ungültige Auswahlen (falscher Kanaltyp, Rolle über dem Bot, ungültige ID), fehlende Berechtigung → 403, Audit-Einträge.

## Grenzen
- Bot-Rechte werden auf Server-Ebene geprüft; Kanal-spezifische Overrides (Rechte pro Kanal) nicht.
- Dashboard-UI wurde kompiliert und typgeprüft, aber nicht im Browser bedient (Login braucht echtes Discord-OAuth).
- Die Permission-Prüfung nutzt noch die Bewerbungs-Permissions (`applications.view/manage`); das zentrale System folgt in Phase 6.
