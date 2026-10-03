# Phase 5 – Dashboard-Grundsystem

**Stand:** abgeschlossen und im Browser geprüft (2026-10-04) – gegen Fake-Discord und eine selbst signierte Test-Session, **nicht** mit echtem Discord-Login.

## Oberfläche (`apps/dashboard`)
| Bereich | Umsetzung |
| --- | --- |
| Sidebar + Kopfzeile | `GuildLayout`: Navigation, Servername/-icon, „Server wechseln“, Design-Umschalter, Abmelden; mobil einklappbar (Hamburger + Scrim) |
| Serverauswahl | `/servers` (Phase 4) |
| Übersicht | Mitglieder, offene/angenommene/abgelehnte Bewerbungen, Formulare, Konfigurations-Check. Beamte, Shifts, Einsätze, Fahndungen, Tickets, Gefahrenstufe: **„Modul noch nicht verfügbar“** statt Fake-Zahlen – sie werden mit ihren Phasen angeschlossen |
| Rollen & Kanäle wählen | Auswahl-Felder (Phase 3) mit Toasts |
| Rollen | Rollen aus Discord mit 🟢/🔴 und Grund |
| Kanäle | nach Kategorien gruppiert (Text/Voice) |
| Berechtigungen | Rolle → Permissions per Checkbox, verwaiste Zuordnungen (gelöschte Rollen) entfernbar |
| Logs | Audit-Log, neueste zuerst, „Mehr laden“ (Cursor), Vorher/Nachher aufklappbar |
| Dark Mode | System-Vorgabe, manuell umschaltbar, Wahl wird gespeichert (ohne Speicher funktioniert die Seite trotzdem) |
| Lade-/Fehlerzustände | `QueryState` (Skeleton, Fehlertext, „Erneut versuchen“, 403 → „Berechtigung fehlt“), `ErrorBoundary` für Render-Fehler |
| Toasts | Erfolg/Fehler bei jedem Speichern |
| Responsive | getestet bei 375 px |

## API
| Endpunkt | Zugriff |
| --- | --- |
| `GET/PUT /guilds/:id/permissions[/:roleId]` | nur Server-Verwalter |
| `GET /guilds/:id/audit?action&limit&cursor` | nur Server-Verwalter |

Neu: `@RequireGuildAdmin()` – Besitzer, Administratoren, „Server verwalten“ (serverseitig aus Bot-Daten berechnet). Eine NEXUS-Rolle mit `applications.manage` reicht dafür bewusst **nicht**, sonst könnte sie sich selbst beliebige Rechte geben. Änderungen werden gegen Discord validiert (Rolle existiert, Permission-Key gültig) und im Audit-Log festgehalten; die Speicherung ist transaktional (`guildRepository.setRolePermissions`).

## Tests
- `apps/api` (+7, gesamt 27): Permissions-Service (Validierung, Audit, verwaiste Rollen), Guard „nur Verwalter“ (inkl. Abweisen einer NEXUS-Rolle mit `applications.manage`).
- `packages/database` (+4, gesamt 13): Rollen-Permissions setzen/entfernen, Parallelität, Audit-Paginierung.
- Browser: Übersicht, Berechtigungen (Rolle wählen, Haken setzen, speichern → DB + Audit + Zähler), Logs, Mobil + Menü, 403-Zustand für ein normales Mitglied.

## Grenzen
- Toast-Anzeige wurde nicht per Screenshot belegt (4 s sichtbar; Speichern selbst ist über DB/Audit belegt).
- Die Navigation wird für Nutzer ohne Rechte nicht ausgeblendet; der Server verweigert die Daten (403). Rechte-abhängige Navigation kommt mit dem zentralen Permission-System (Phase 6).
- Die Zuordnung nutzt noch den Bewerbungs-Permission-Katalog; Phase 6 ersetzt ihn.
- Mitgliederzahl zeigt 0, wenn Discord keine Zahl liefert (z. B. im Fake).
- Rollen/Kanäle werden nicht per Live-Update aktualisiert (Phase 30), nur per „Neu laden“.
