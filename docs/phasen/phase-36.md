# Phase 36 – Abschlussprüfung

**Stand:** abgeschlossen (2026-10-04). Gesamtprüfung nach Phase 0–35 und 36a.

## Ergebnis auf einen Blick
| Prüfung | Ergebnis |
| --- | --- |
| Tests (`pnpm -r test`, echte PostgreSQL + Redis, Discord als Attrappe) | **28 Pakete/Apps, 730 Tests grün**, 0 rot (4 Lasttests laufen nur mit `LOAD=1`) |
| Typprüfung (`pnpm -r typecheck`) | grün |
| Lint | 0 Fehler (einzelne Warnungen in Skripten/Tests) |
| Build aller Pakete + Dashboard | grün |
| `pnpm audit --prod` | **keine bekannten Schwachstellen** – zwei vorher gefundene (`deepmerge-ts` über Prisma-CLI, `js-yaml` über `@nestjs/swagger`) per `pnpm.overrides` behoben, danach Prisma-Generierung und Migrationsstand geprüft |
| `pnpm audit` (inkl. Dev) | 2 mittlere Meldungen zu **vitest** (Pfad-Lesezugriff des Vitest-Dev-Servers, Fix erst ab Version 4.1.11 = Hauptversionssprung). Nur Entwicklung; es läuft kein Vitest-Server/UI. Offen bewusst gelassen. |
| Datenbank | 23 Migrationen, keine Abweichung zum Schema; Sicherung/Wiederherstellung real geprüft (Phase 35) |
| Produktions-Bundle der API (`pnpm deploy --prod` + `prisma generate`, wie im Dockerfile) | startet gegen echte DB/Redis, `/api/v1/health` antwortet, ungeschützte Routen → 401 |
| Worker | läuft, schreibt Herzschlag, neuer Job `ticket-cleanup` registriert |
| Sicherheit (Phase 32) | CSRF, Rate Limits, Header, Konfigurationsprüfung, Autorisierungs-Sweep, Quellcode-Hygiene – weiterhin grün |

## Was „fertig“ bedeutet – und was nicht
Fertig und durch Tests belegt: die gesamte Fachlogik (Bewerbungen, Personal, Schichten, Einheiten, Funk, Einsätze, Fahndungen, Fuhrpark, Ausbildung, Beförderungen, Tickets, SEK, Abmeldungen, Berichte, Automatisierung, Audit, Live-Aktualisierung), die API mit Rechteprüfung auf jeder Route, die Bot-Interaktionen (Buttons, Menüs, Modals) gegen Attrappen, Health/Monitoring-Bausteine, Sicherung/Wiederherstellung.

**Nie ausprobiert – bitte vor dem Echtbetrieb prüfen:**
1. **Echter Discord-Bot:** Es gab nie einen Token. Aussehen von Embeds/Buttons/Select-Menüs, Datei-Upload (HTML-Transcript), Slash-Command-Registrierung, Kanalrechte, Rollenhierarchie, DMs von Bewerbungen und das echte OAuth2-Login sind nur gegen Attrappen getestet. **Empfehlung:** Testserver, Bot einladen, `docs/production.md` folgen, danach einmal jeden Ablauf durchklicken (Ticket eröffnen/claimen/schließen, Bewerbung abgeben/annehmen/ablehnen, `/health`).
2. **Dashboard im Browser:** nur gebaut und typgeprüft, nie angeklickt (kein Playwright; Login erfordert Discord).
3. **Docker-Images/Compose:** nie gebaut (kein Docker auf dem Entwicklungsrechner), nur die Einzelschritte nachgestellt.
4. **Lastverhalten** nur lokal mit synthetischen Daten (Größenordnungen, Phase 34).
5. Offsite-Backup, Alarmversand, Sentry/Metriken sind nicht eingerichtet (Anleitung vorhanden).

## Entschiedene Auslassungen
- **Leitstelle** (Phase 15) wurde auf Wunsch gestrichen; Rechte `dispatch.*` entfernt.
- Ablehnungsgründe als Auswahlliste sind im Bot nicht mehr erreichbar (Spezifikation: Deny sofort bzw. mit Freitext), bleiben im Dashboard-Ablauf nutzbar.

## Empfohlene nächste Schritte (nach Priorität)
1. Testserver + echter Bot: alle Abläufe einmal durchklicken, Auffälligkeiten melden.
2. Docker-Build auf einem Rechner mit Docker, TLS/Reverse-Proxy, Backup-Cron, Uptime-Check auf `/api/v1/health`.
3. Browser-Test des Dashboards (z. B. Playwright mit einer Fake-OAuth-Anmeldung wie `scripts/fake-discord.mjs`).
4. Vitest auf Version 4 anheben (schließt die letzten zwei Dev-Meldungen).
