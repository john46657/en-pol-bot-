# EN | POLIZEI – Plattform 2.0: Bestandsaufnahme und Abschlussbericht

Stand: 01.11.2026 · Branch `claude/youthful-hopper-s8qbak`

Dieser Bericht unterscheidet streng zwischen **fertig umgesetzt (in dieser Runde)**, **bereits vorhanden** (vorher schon im Repository, nur geprüft) und **offen**. Nichts hier wurde gegen echtes Discord, echte KI-APIs, einen echten ER:LC-Server oder den Produktionsserver getestet.

---

## 1. Bestandsaufnahme

### Architektur – wie MDT, Leitstelle und Dashboard verbunden sind

```
                  Browser (eine React-App, apps/web)
   ┌──────────────┬───────────────────┬──────────────────┐
   │  Dashboard   │  MDT  (/mdt/*)    │ Leitstelle (/cad)│   eigene Vollbild-Oberflächen
   │  AppShell    │  MdtShell         │ CadLayout        │   + gemeinsamer App-Umschalter
   └──────┬───────┴─────────┬─────────┴────────┬─────────┘
          │  ein Sitzungs-Cookie `enrp_session` (httpOnly, SameSite=Strict, Secure in Prod.)
          ▼
   NestJS-API apps/api  (/api/v1, Socket.IO /ws)  ── AuthGuard → PermissionGuard → Service → Prisma
          │                         ▲
          ▼                         │ Bot-Token + X-Discord-User (Rechte des verknüpften Benutzers)
     PostgreSQL (eine DB)      Discord-Bot apps/bot (Outbox-Polling, Slash-Commands, Buttons)
```

- **Es gibt nicht drei getrennte Backends**, sondern eine API, eine Datenbank und eine Web-App mit drei Oberflächen. Dadurch sind Login, Benutzer, Rollen, Rechte und Daten bereits **zwangsläufig gemeinsam** – ein Dienststatus, der im MDT geändert wird, ist dieselbe Zeile, die die Leitstelle anzeigt (Live über WebSocket-Räume).
- Stack: NestJS 11, Prisma 6, PostgreSQL, React 19, Vite, Tailwind 4, TanStack Query, Socket.IO; `packages/shared` hält Rechte-Katalog, Resolver, Status-Übergänge und gemeinsame Schemas.
- Umfang: 131 Prisma-Modelle, 69 Migrationen (+1 neue), 73 API-Testdateien (445 Tests auf dem Ausgangsstand, alle grün), Bot- und Web-Tests, Playwright-E2E.

### Authentifizierung und Rechte (vorhanden)
- Login mit Passwort (scrypt, Sperre nach 5 Fehlversuchen, Rate-Limit), Discord-Login, 2FA (TOTP), serverseitige Sitzungen (nur SHA-256 des Tokens gespeichert), Ablauf `SESSION_TTL_HOURS`, Abmeldung widerruft serverseitig, Deaktivieren eines Benutzers widerruft alle Sitzungen ([authentication.md](authentication.md), [security.md](security.md)).
- Zentrale Rechteprüfung im Backend (`PermissionGuard` + `AuthorizationService`: Server → Mitgliedschaft → Modul → Recht → Datenbereich), Rollen je Discord-Server, Benutzer-DENY/ALLOW, Gruppen, Wildcards, Discord-Rollen-Abgleich, Bereichsrechte `dashboard.*.view` ([authorization.md](authorization.md), [multi-server.md](multi-server.md)). Die vorgeschlagenen Rollen (Administrator, Leitung, Ausbilder, Prüfer …) werden **nicht** fest eingebaut, weil die tatsächlichen Rollen je Server im Dashboard gepflegt werden; Rechte gibt es bereits je Anwendung und Funktionsbereich (`cad.*`, `persons.*`, `applications.review`, `ticket.*`, `messagebuilder.*`, `users.*` …).
- Server sind strikt getrennt (Manipulation fremder Server-IDs wird abgewiesen, Tests vorhanden).

### Vorhandene Funktionen (Auszug, siehe README-Statustabelle)
MDT (Bürger/Akte, Fahrzeuge, Haftbefehle, Polizeifahrzeuge, Berichte, Einsätze, Dienstliste) · Leitstelle (Einsätze, Einheiten, Notrufe → Einsatz, Karte mit Layern, Funk-Chronik, Schichtübergabe, Statistik, ER:LC Live, Cross-Server) · Dashboard (Bewerbungen + lokaler KI-Checker, Qualifikationen, Personal/Beförderungen/Ausbildung/Prüfungen, Tages-/Wochenberichte, Abmeldungen, Ticket-System nach GalaxyBot-Umfang inkl. Premium-Ticket-Center, Discord Message Builder (Discohook-artig), Embeds/Panels, Benachrichtigungen, globale Suche, Audit, Backups, Studio, Funk-Whitelist/Zello Work).

### Deployment (vorhanden)
Docker Compose (db, api, web/Caddy-HTTPS, optional bot, täglicher `backup`-Container), `deploy/setup-server.sh`, `deploy/update.sh` (sichert die DB **vor** jedem Update nach `backups/vor-update/`), `deploy/restore.sh`; alternativ Panel-Hosting-Paket `hosting/` und Einzel-Bot `bot.js`. API führt beim Start nur `prisma migrate deploy` aus (nie `reset`/`db push`).

### Ausgangslage KI-Bewerbungsprüfung
Eine echte Gemini-Prüfung existierte bereits (Commit `ae1a145`) und wurde danach entfernt (`7d1f7c5`, Migration `20261124…_remove_application_ai_review` hat die Tabelle gelöscht). Diese Löschung ist **bereits** auf Systemen gelaufen, die das Update eingespielt haben; frühere KI-Ergebnisse sind dort nicht wiederherstellbar (außer aus Backups).

---

## 2.–4. Überarbeitete Funktionen

| Bereich | Status | Was |
|---|---|---|
| **KI-Bewerbungsprüfung** | **fertig (neu)** | Wiederhergestellt und erweitert: neue Bewerbungen (Web/Dashboard **und** Discord, Polizei + Einheiten) werden **automatisch im Hintergrund** analysiert (Ereignis `applicationEvents` → Warteschlange → Analyse; blockiert das Einreichen nie); Ergebnis dauerhaft gespeichert; Benachrichtigung `AI_REVIEW` an Prüfer; kurze Discord-Meldung im Bewerbungskanal nur mit Empfehlung + Richtwert, Details privat per Button; erneute Analyse jederzeit; je Server abschaltbar; Tageslimit, max. gleichzeitig, Zeitlimit, Wiederholungen nur bei vorübergehenden Fehlern; nach Neustart nie erneut gesendet; **KI entscheidet nie**. |
| **KI-Anbieter modular** | **fertig (neu)** | Google Gemini + OpenAI-kompatibel: Groq, OpenRouter, Mistral, Ollama (`AI_PROVIDER`, `*_API_KEY`, `AI_MODEL`, `OLLAMA_BASE_URL`). Bestehende Installationen mit nur `GEMINI_API_KEY` bleiben bei Gemini. Schlüssel nur serverseitig, nie in Antworten/Logs/Discord. |
| **Systemstatus & Diagnose** | **fertig (neu)** | *Verwaltung → Systemstatus*: Datenbank, API, MDT, Leitstelle, WebSocket, Discord-Bot (letzte echte Abfrage), Discord-Zustellung (wartend/fehlgeschlagen), ER:LC, KI-Anbieter, Tickets, Backups, Funkdienst. Nicht verbundene/nicht eingerichtete Dienste erscheinen nie als „OK“. Diagnose (Sitzungsgeheimnis, Web-Adresse/Cookies, Bot-Zugang, Speicher beschreibbar, aktiver Administrator) nur für globale Systemadministratoren, ohne Geheimniswerte. |
| **Gemeinsamer App-Umschalter** | **fertig (neu)** | Einheitlicher Umschalter *Dashboard · MDT · Leitstelle* in allen drei Kopfleisten, nur berechtigte Anwendungen. **Abmelden** jetzt auch in MDT und Leitstelle (vorher nur im Dashboard). Gemeinsamer Markenkopf (Name aus dem Studio, bestehendes Wappen, Kennzeichnung der App). |
| **Designsystem** | **teilweise** | Gemeinsame Tokens existierten bereits (eine `styles.css` für alle drei Oberflächen). Grundflächen leicht Richtung Navy/Anthrazit verschoben, Markenfarbe (Primary `#3b82f6`), Logo, Name und persönliche Design-Einstellungen unverändert. Kein vollständiges Re-Design einzelner Seiten. |
| Gemeinsamer Login | **bereits vorhanden** | Eine Sitzung für alle drei Oberflächen (gleiche Origin); keine Tokens im Frontend. Keine Änderung nötig, keine Konten verändert. |
| Zentrale Benutzer-/Rollenverwaltung | **bereits vorhanden** | Unverändert. |
| Ticket-System, Embed-/Message-Builder, Ausbildung, Dienst-/Wochenberichte, globale Suche, Benachrichtigungen | **bereits vorhanden** | Geprüft, nicht verändert. Ausbildungsaufgaben unverändert (Verkehrskontrolle, Festnahme und Durchsuchung, Führungsaufgabe); keine entfernten Aufgaben wieder eingeführt. Neu nur die Benachrichtigungsart „KI-Bewerbungsprüfung“. |
| MDT/Leitstelle fachlich (Personen, Fahrzeuge, Dienststatus, Einsätze, Einheiten, Karte) | **bereits vorhanden, nicht erweitert** | Keine erfundenen Live-Positionen oder Funkübertragungen; der Systemstatus kennzeichnet ausdrücklich, dass ohne Zello Work keine Funkübertragung angeboten wird. |

## 5.–6. Login, Rollen und Berechtigungen
- Keine Änderung am Login-Verfahren oder an Benutzerkonten.
- Neue Endpunkte prüfen Rechte serverseitig: `GET /system/status` → `settings.view` (Diagnose zusätzlich globaler Admin); KI: `applications.review` bzw. `qualifications.decide`, Einstellungen `qualifications.manage`; Bot-Zugriff über die Rechte des verknüpften Discord-Benutzers.

## 7. Datenbank
- Neue Migration `20261205100000_application_ai_review_restore`: `CREATE TABLE IF NOT EXISTS "ApplicationAiReview"` + Indizes `IF NOT EXISTS`. **Nicht-destruktiv**, keine bestehende Tabelle/Spalte wird verändert oder gelöscht. Neuer Wert `via = 'AUTO'` (Textspalte, keine Schemaänderung).
- Einstellungen `applications.aiReview[@guild]` erhalten das Feld `auto` (fehlt es, gilt „an“).

## 8. Neue und geänderte Dateien (Quellcode)
Neu: `apps/api/src/applications/ai-review/*` (wiederhergestellt + erweitert), `apps/api/src/common/application-events.ts`, `apps/api/src/system-status/*`, `apps/api/prisma/migrations/20261205100000_application_ai_review_restore/`, `apps/bot/src/commands/ai-review.ts`, `apps/web/src/components/AiReviewPanel.tsx`, `apps/web/src/components/AppSwitcher.tsx`, `apps/web/src/pages/admin/SystemStatus.tsx`, `packages/shared/src/ai-review.ts`, Tests `apps/api/test/{application-ai-review,system-status}.test.ts`, `apps/bot/tests/ai-review.test.ts`, `apps/web/tests/{ai-review,app-switcher}.test.tsx`, `packages/shared/tests/ai-review.test.ts`, dieser Bericht.
Geändert: Bewerbungs-/Qualifikations-Service (Ereignis + Button), `discord.service.ts` (Zeitpunkt der letzten Bot-Abfrage), `app.module.ts`, Bot `format.ts`/`system.ts`/`qualifications.ts`, Web `App.tsx`/`nav.ts`/`AppShell.tsx`/`MdtShell.tsx`/`CadLayout.tsx`/`PersonalSettings.tsx`/`Applications.tsx`/`styles.css`, `schema.prisma`, `.env.example`, `docker-compose.yml`, `scripts/hosting/env.example`, Doku (`README.md`, `applications.md`, `deployment.md`, `discord-bot.md`). Gebaute Pakete `bot.js` und `hosting/` neu erzeugt.

## 9.–10. Durchgeführte Tests und Ergebnisse
Ausgeführt in dieser Umgebung (PostgreSQL 16 lokal, da das eingebettete PostgreSQL hier eine fehlende ICU-Bibliothek hat):
- Ausgangsstand (unveränderter `main`): API 445/445 grün.
- Shared 129/129, Bot 266/266, Web 61/61 grün; Typecheck und ESLint für alle Pakete ohne Fehler; Web-Produktionsbuild erfolgreich.
- Neue API-Tests: KI (u. a. automatischer Lauf nach öffentlicher Bewerbung, Benachrichtigung nur an Prüfer, Discord-Meldung ohne Bewerbungstext, Abschalten je Server, Ausfall des Anbieters, Tageslimit, ohne Anbieter keine Analyse, Groq-Anbindung, Schlüssel nie in Antworten) und Systemstatus (403/401, echte Zustände, Bot erst nach Abfrage „OK“, fehlgeschlagene Zustellungen, Diagnose nur global).
- Komplette API-Suite nach allen Änderungen: **467/467 grün** (75 Dateien).
- Hinweis: Die API-Testdateien teilen sich eine Datenbank. In zwei von vier Gesamtläufen schlugen je 2 Tests fehl, weil Daten anderer Dateien mitgezählt wurden (u. a. die bestehende globale Ticket-Statistik in `support-tickets.test.ts`); einzeln und im letzten Gesamtlauf grün. Meine eigenen Statustests sind entsprechend reihenfolgeunabhängig formuliert; die bestehenden Ticket-Tests wurden nicht verändert.

**Nicht** ausgeführt: Playwright-E2E, Tests auf Tablet/Smartphone im Browser, Last-/Neustarttests am echten Server, echte KI-APIs (Anbieter simuliert), echtes Discord, echter ER:LC-Server, Docker-Deployment.

## 11. Bekannte Einschränkungen / offen
- Kein vollständiges Re-Design jeder einzelnen Seite; die Vereinheitlichung beschränkt sich auf Tokens, Kopfleisten, Markenkopf und Umschalter.
- Bot-Verbindungsstatus wird im Speicher des API-Prozesses gemessen (nach API-Neustart „nicht gemeldet“, bis der Bot das nächste Mal abfragt – üblicherweise Sekunden).
- Automatische KI-Analysen laufen in der Warteschlange des API-Prozesses; bei einem Neustart werden wartende (noch nicht gestartete) Analysen nicht nachgeholt – sie können manuell gestartet werden.
- Frühere KI-Ergebnisse vor der Entfernung sind auf Systemen mit eingespielter Lösch-Migration verloren.
- Datenschutz: Bei Groq/OpenRouter/Mistral/Gemini verlassen (minimierte) Bewerbungstexte den Server; Bedingungen der Anbieter vor dem Livebetrieb prüfen. Ollama hält alles lokal.
- Nicht umgesetzt aus dem Master-Prompt (bewusst, da vorhanden oder ohne Grundlage): neue feste Rollen, neue MDT-/Leitstellen-Fachfunktionen, eigene Funk- oder Positionsdaten.

## 12. Deployment-Anleitung (VPS, Docker Compose)
Vorher den aktuellen Zustand prüfen (`cd /opt/en-pol-bot && git status && docker compose ps`).
1. `./deploy/update.sh` – sichert die Datenbank nach `backups/vor-update/`, holt den Code, baut und startet neu. Volumes (`pgdata`, `uploads`) bleiben erhalten; Migrationen laufen automatisch und sind nicht-destruktiv.
2. Bot (falls genutzt): `docker compose --profile bot up -d --build bot`.
3. Prüfen: Dashboard → *Verwaltung → Systemstatus*; Anmelden einmal im Dashboard, dann über den Umschalter in MDT und Leitstelle wechseln (gleiche Sitzung), dort abmelden.
4. Rollback: vorherigen Commit auschecken, `docker compose up -d --build`; Daten bei Bedarf mit `./deploy/restore.sh backups/vor-update/<datei>.sql.gz`. Die neue Migration legt nur eine Tabelle an, ältere Versionen ignorieren sie.

Panel-Hosting: neues `hosting/`-Paket bzw. `bot.js` verwenden ([HOSTING-ANLEITUNG.md](../HOSTING-ANLEITUNG.md)).

## 13. Manuelle Einrichtungsschritte
1. KI-Anbieter wählen und Schlüssel **nur** in der `.env` auf dem Server eintragen, z. B. `GEMINI_API_KEY=…` oder `AI_PROVIDER=groq` + `GROQ_API_KEY=…`; `chmod 600 .env`; `docker compose up -d api`.
2. Dashboard → *Bewerbungen → Einrichtung → KI-Bewerbungsprüfung*: RP-Regeln und Auswahlkriterien hinterlegen, „automatisch“ nach Wunsch an/aus.
3. Zuerst mit fiktiven Testbewerbungen prüfen; Bewerber ggf. über die KI-Auswertung informieren.
4. Prüfer können die Benachrichtigungsart „🤖 KI-Bewerbungsprüfung“ unter *Persönlich* ausblenden.
