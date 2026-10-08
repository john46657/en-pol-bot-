# EN Polizei

> 🤖 **Panel-Start aus `main` (API + Web + Bot):** Startdatei `start.js` – startet das fertige Paket aus `hosting/` (erzeugt mit `pnpm bundle:hosting`, nicht von Hand ändern). Anleitung: [HOSTING-ANLEITUNG.md](HOSTING-ANLEITUNG.md).
>
> 🤖 **Nur der Bot:** `bot.py` + `bot.js` im Hauptverzeichnis sind der fertig gebaute Discord-Bot (`bot.js` wird aus `apps/bot` mit `pnpm bundle:bot` erzeugt – nicht von Hand ändern). Startbefehl: `python3 bot.py` oder `node bot.js`; Einstellungen in einer `.env` (Vorlage: `apps/bot`-Doku in [docs/discord-bot.md](docs/discord-bot.md)).

> 📦 **Der frühere Python-Bot** (Emden RP Bot) ist entfernt (Git-Historie); seine Funktionen sind portiert. Übersicht: [docs/migration-vom-alten-bot.md](docs/migration-vom-alten-bot.md).

Polizei-CAD / MDT / Leitstelle für Emergency Response: Liberty County (Roblox). Nur Polizei und Leitstelle.
Stack: NestJS 11 · Prisma 6 · PostgreSQL · React 19 · Vite · Tailwind 4 · TanStack Query · Socket.IO.

> **ER:LC-Integration + CAD-Leitstelle** (Server-Key verschlüsselt im Backend, Live-Daten, Notrufe, Karte, Command Center, Cross-Server Leitstelle ↔ SEK/K9): [docs/cad.md](docs/cad.md). Galaxy AI ist nicht enthalten. Doku: [docs/](docs).

## Schnellstart (alles mit einem Befehl testen)
```bash
pnpm install
pnpm dev:all     # eingebettetes PostgreSQL + Migrationen + Seed + Demodaten + API :3000 + Web :5173
```
Danach http://localhost:5173 öffnen – Konten und ein Testplan zum Durchklicken stehen in [docs/test-guide.md](docs/test-guide.md). Funktionen ergänzen: [docs/extending.md](docs/extending.md).

Einzelne Schritte / Prüfungen:
```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test
pnpm e2e         # Playwright (nutzt das installierte Google Chrome)
```

## Status
| Bereich | Stand |
|---|---|
| Anmeldung, Sitzungen, Kontosperre, Anmeldeverlauf, Sicherheitsereignisse | fertig |
| Rechte (zentrale Auflösung, VERBOT/ERLAUBNIS je Benutzer, Gruppen, Platzhalter), Roblox-ID (manuell) | fertig |
| Personen (+ Zusammenführen), Fahrzeuge, Tatbestände | fertig |
| Leitstelle/Einsätze/Einheiten, Berichte (versioniert), Beschwerden, Ermittlungen, Fahndungen, Beweismittel (Verwahrkette) | fertig |
| Personal, Dienst, Bewerbungen, Qualifikationen ([docs/qualifications.md](docs/qualifications.md)), Akademie, Kommunikation, Benachrichtigungen, Suche, Auswertungen | fertig (Grenzen siehe Doku) |
| Audit (nur anhängen, DB-Trigger) + Zeitleiste, Exporte (CSV/JSON/PDF), Medien-Upload, Einstellungen, Aufbewahrung | fertig |
| WebSockets (geprüfte Räume) | fertig |
| React-Oberfläche: Rahmen, Suche, Benachrichtigungen, Dashboard (anpassbar), Einsatzübersicht, alle Listen/Details, Administration | fertig |
| Paket für Panel-Hosting (`pnpm bundle:hosting` → ein ZIP mit API + Web + Bot, z. B. für bot-hosting.net): [docs/hosting-bot-hosting.md](docs/hosting-bot-hosting.md) | lokal durchgespielt (Installieren → Starten → Anmelden); **echtes Panel ungetestet** |
| Hosting auf einem VPS (Docker Compose + Caddy HTTPS + tägliche DB-Sicherung + Skripte für Einrichtung/Update/Wiederherstellung): [docs/deployment.md](docs/deployment.md) | geschrieben; Produktions-Build lokal getestet, **Docker selbst nicht ausgeführt** |
| Discord-Bot (`apps/bot`): Slash-Befehle (Abfragen, Dienst + Dienstzeiten, SEK-Liste/-Berichte, Bewerbungs- und Qualifikations-Panels mit Fragen Schritt für Schritt per DM (Polizei, SEK, Flugstaffel, Ausbilder), Leitstelle, Bericht/Beschwerde/Ermittlung/Fahndung/Beweismittel anlegen, Entscheidungs-DMs, Gefahrenstatus-Panel, selbst aktualisierende Teamliste, Funk-Whitelist, Roblox-Suche) mit den Rechten des verknüpften Benutzers, Kanal-Meldungen über die Warteschlange, Verknüpfung per Einmal-Code ([docs/discord-bot.md](docs/discord-bot.md)) | fertig; **nicht gegen echtes Discord getestet** |
| Eigenständiges Bot-Paket (`pnpm bundle:bot` → eine eigenständige `bot.js` + Quellcode) | fertig; lädt ohne node_modules (geprüft), **echtes Discord ungetestet** |
| MDT-Portal, Team-Dashboard (Aktionen für Vorgesetzte), Entwicklungsstart mit Demodaten in einem Befehl | fertig |
| Browser-E2E-Tests, öffentliche Bewerbungsseite `/apply` | fertig |
| Support-Ticket-System für Discord, komplett im Dashboard eingerichtet (Panel-Baukasten mit Vorschau, Kategorien, Fragen, Buttons, Rollen, Status, Prioritäten, Schließgründe, Transkripte, Bewertungen, Statistik, automatisches Schließen/Löschen, interne Notizen, `ticket.*`-Rechte): [docs/support-tickets.md](docs/support-tickets.md) | fertig; **nicht gegen echtes Discord getestet** |
| Studio: eigene Felder (Personen/Fahrzeuge), Akzentfarbe, Bewerbungsformular ([docs/studio.md](docs/studio.md)) | fertig |
| Dashboard: Discord-Rollen laufend geprüft, Rollen-Hierarchie/-Editor/Matrix, Bereichsrechte, Server getrennt, persönliches Design + Widgets + Layouts, Teamliste (alle 5 s) und Voice-Widget getrennt, automatisches Speichern: [docs/dashboard.md](docs/dashboard.md) | fertig; **Teamliste/Voice nicht gegen echtes Discord getestet** |
| CAD-Leitstelle + ER:LC (`/cad`): Einsätze, Einheiten, Notrufe → Einsatz, Funk-Chronik, interaktive Karte mit Layern/POIs/Zonen, ER:LC Live, Command Center, Teamübersicht, Cross-Server, konfigurierbare Prioritäten/Status/Kanäle, `cad.*`-Rechte: [docs/cad.md](docs/cad.md) | fertig; **nicht gegen echten ER:LC-Server/Discord getestet** |
| Abmeldungen wie Trident (`/leave manage`, Dauer 6h/4d/2w, Annehmen/Ablehnen mit Grund, DMs) · Gefahrenstatus Status 1–4 (Texte/Farben/Ping einstellbar) · Bewerbungs-Statistik | fertig |
| Dashboard durchgehend auf Deutsch (Oberfläche, Status-/Prioritätsnamen, Server-Fehlermeldungen, Verlauf, Benachrichtigungen) | fertig |
| Büros: wer in welchem Talk ist · Sprach-Support fürs Büro wie GalaxyBot (Warteraum → Meldung mit Übernehmen/Ablehnen/Nachricht → eigener Sprachkanal, Notizen-Thread, Supportzeiten, Bewertung; Wartemusik vorbereitet): [docs/voice-support.md](docs/voice-support.md) | fertig; **nicht gegen echtes Discord getestet** |
| Embed-Baukasten (Abschnitte mit Emoji, Bilder hochladen/einfügen, mehrere Bilder, Fußzeilen-Icon, Datum/Zeit, Reaktionen, Vorschau, senden und dieselbe Nachricht aktualisieren): [docs/discord-bot.md](docs/discord-bot.md) | fertig; **nicht gegen echtes Discord getestet** |
| Funk-Codes als Discord-Nachricht · Staff-Liste nach Discord-Rollen (selbst aktualisierend) · Formular-Panels (Button → Formular → Nachricht als Person mit Reaktionen) · Tages-/Wochenberichte mit eigenen Vorlagen (Dashboard + `/dienstbericht`, überall bearbeitbar) | fertig; **nicht gegen echtes Discord getestet** |
| Personal- & Verwaltungssystem: Personalakte, Beförderungen mit Genehmigungsstufen und Voraussetzungen, Versetzungen, Ausbildungen/Prüfungen/Zertifikate, Verwarnungen, Auszeichnungen, interne Meldungen/Abstimmungen, Dienstnummern mit atomarer Vergabe und Bewerbungs-Automatik: [docs/personnel.md](docs/personnel.md) | fertig (API-Tests); **Discord-Teil nicht gegen echtes Discord getestet** |
| Willkommen & Abschied je Server (Nachricht mit Banner, DM, Auto-Rollen) · Aktion beim Verlassen (Bewerbungen ablehnen/zurückziehen, Tickets schließen): [docs/discord-bot.md](docs/discord-bot.md) | fertig; **nicht gegen echtes Discord getestet** |
| 2FA (Authenticator-App, Wiederherstellungscodes) · Datensatz-Sperre beim Bearbeiten · virtualisierte Tabellen (bis 500 Zeilen/Seite) · Studio-Workflows (Wenn Ereignis → Benachrichtigung/Discord): [docs/security.md](docs/security.md), [docs/studio.md](docs/studio.md) | fertig |
