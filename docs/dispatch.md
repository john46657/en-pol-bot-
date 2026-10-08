# Leitstelle & Einsätze

- Einsätze `I-JJJJ-XXXXXX`; Statusablauf `NEW → ACKNOWLEDGED → ASSIGNED → EN_ROUTE → ON_SCENE → PROCESSING → CLEARING → CLOSED` (+ `CANCELLED`), festgelegt in `packages/shared/src/statuses.ts`.
- Einheiten (`/dispatch/units`) mit den Status AVAILABLE/BUSY/EN_ROUTE/ON_SCENE/UNAVAILABLE/OFF_DUTY. Eine zugewiesene Einheit wird BUSY; Schließen/Abbrechen gibt die Einheiten frei.
- Personen und Fahrzeuge lassen sich an Einsätze hängen (ohne Dubletten, mit Eintrag in der Zeitleiste der Person).
- Echtzeit: Räume `dispatch`, `incidents`, `team` (Prüfung der Abos siehe `security.md`).
- Prioritäten sind hier fest LOW…CRITICAL. Die CAD-Leitstelle (`/cad`, [cad.md](cad.md)) hat einstellbare Prioritäten, Status und Kanäle. Funk/Einsatz-Chat läuft über das Kommunikationsmodul (Kanal `INCIDENT` gibt es in der API).
