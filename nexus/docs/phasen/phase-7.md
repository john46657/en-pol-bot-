# Phase 7 – Panel-System

**Stand:** abgeschlossen (2026-10-04) – API, Rendering, Bot-Handler, Dashboard-Editor, Migration, Tests, Praxistest. **Nicht gegen echtes Discord getestet** (Fake-Discord mit Nachrichten-Endpunkten + Browser).

## Modell
`Panel` (`panels`): `name`, `config` (JSON), `channelId`/`messageId`/`lastSentAt` (zuletzt gesendete Nachricht), `autoUpdate`, `createdBy`. Guild-scoped, Cascade beim Löschen des Servers. Die Bewerbungs-Panels (`ApplicationPanel`, `/guilds/:id/panels`) bleiben unverändert; die universellen Panels liegen unter `/guilds/:id/message-panels`.

`PanelConfig` (`@nexus/types`): Text über dem Embed, Embed (Titel, Beschreibung, Farbe, Thumbnail, Bild, Footer, Felder), bis zu 20 Buttons (Stil blau/grau/grün/rot/Link, Emoji) und ein Auswahlmenü (bis 25 Optionen mit Emoji/Beschreibung). Aktionen beim Klick: **Nachricht** (nur für den Klickenden sichtbar) oder **Rolle vergeben/entziehen**; weitere Aktionstypen (Bewerbung, Ticket, Shift …) werden von ihren Modulen ergänzt.

## Bausteine
| Baustein | Ort |
| --- | --- |
| Validierung (zod): https-only-URLs, Emoji-Format, Komponenten-IDs, Discord-Limits (inkl. 6000 Zeichen gesamt), Link-Button ⇔ URL, sonst Aktion, eindeutige IDs | `@nexus/validation` (`panelConfigSchema`) |
| Rendering → Discord-Nachricht (Reihen à 5, Select als eigene Reihe, ≤ 5 Reihen), Custom-IDs `nexus:panel:btn:<panelId>:<komponente>` / `nexus:panel:sel:<panelId>` | `@nexus/discord` (`renderPanelMessage`) |
| Repository (alles mit `guildId`) | `panelRepository` |
| API: CRUD, `POST …/send`, Löschen (optional inkl. Nachricht) | `apps/api/src/modules/panels` |
| Klick-Handler (Button/Select) | `apps/bot/src/panels/panel-handlers.ts` |
| Editor mit Live-Vorschau, Kanalwahl, Rollenwahl, „Speichern“, „In Kanal senden / In Discord aktualisieren“ | `apps/dashboard` (`/guilds/:id/panels`) |

Neue Permissions (Modul `panels`): `panels.view`, `panels.manage`.

## Verhalten
- **Senden:** nur in vorhandene **Textkanäle**; erneutes Senden in denselben Kanal **bearbeitet** die Nachricht; Kanalwechsel löscht die alte Nachricht; ist die Nachricht auf Discord verschwunden (404), wird neu gesendet; fehlende Kanalrechte ergeben eine klare Meldung.
- **Automatische Aktualisierung:** Ändert man die Konfiguration eines bereits gesendeten Panels (und `autoUpdate` ist an), wird die Discord-Nachricht sofort aktualisiert; scheitert das, bleibt die Änderung gespeichert und die Antwort meldet `synced: failed`.
- **Rollen-Aktionen (Sicherheit):** beim Speichern wird geprüft, dass die Rolle existiert, vom Bot verwaltbar ist und **keine Verwaltungsrechte** hat (Administrator, Server/Rollen/Kanäle/Webhooks verwalten, Kick, Ban); zur Klickzeit prüft der Bot das **erneut**. Panel und Aktion werden bei jedem Klick frisch aus der Datenbank gelesen (guild-scoped); gelöschte/geänderte Komponenten antworten „nicht mehr aktuell“. Antworten haben keine Erwähnungen (`allowedMentions: none`).
- Alle Änderungen (anlegen, ändern, senden, löschen) landen im Audit-Log.

## Tests
`packages/validation` (5), `packages/discord` (7 inkl. Rendering/Limits), `packages/database` (+2: guild-isoliertes CRUD, Cascade), `apps/api` (+14: Konfiguration, Rollenprüfungen, Senden/Bearbeiten/404-Neusenden/Kanalwechsel/Rechtefehler/Auto-Update/Löschen, Fremdserver), `apps/bot` (+6: Nachricht, Select, Rolle vergeben/entfernen, verbotene Rollen, veraltete Panels, Fremdserver).
Praxistest (laufende API + DB + Fake-Discord): ohne Recht 403; gültiges Panel angelegt; nicht vergebbare Rolle 400; http-Link 400; Senden → Nachricht mit korrekten Custom-IDs im (Fake-)Kanal; Sprachkanal 400; Konfig-Änderung → `synced: updated`, Nachricht aktualisiert (nicht doppelt); Löschen entfernt Nachricht. Browser: Panel anlegen, Titel ändern (Live-Vorschau), Buttons hinzufügen, Aktion auf „Rolle“ umstellen (Auswahl zeigt nur vergebbare Rollen), Kanal wählen, senden – Nachricht und DB stimmen.

## Grenzen
- Klick-Handler gegen echtes Discord ungetestet; Rollenwechsel mit Attrappen.
- Auswahlmenü: genau ein Wert pro Auswahl (Mehrfachauswahl nicht vorgesehen).
- Kanal-spezifische Bot-Rechte werden erst beim Senden von Discord bestätigt (Fehler wird übersetzt).
- Der Editor hat keine Drag-and-drop-Sortierung (Reihenfolge = Reihenfolge der Anlage).
