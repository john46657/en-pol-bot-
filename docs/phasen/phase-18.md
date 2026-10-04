# Phase 18 – Gefahrenstatus

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/danger`, Datenmodell, API, Bot `/gefahr`, Dashboard „Gefahrenstatus“, Tests gegen echte Datenbank. **Kanal-Meldung nur mit Port-Attrappe, Bot nur mit Attrappen, Dashboard nicht im Browser getestet, kein echtes Discord.**

## Funktionen
- **Konfigurierbare Stufen**, Standard **0–5** (Normalbetrieb … Ausnahmezustand), werden beim ersten Zugriff angelegt (idempotent, auch parallel). Je Stufe: Name, **Farbe** (#RRGGBB), **Emoji**, **Beschreibung**, **berechtigte Rollen**. Weitere Stufen bis 20 anlegbar; die aktuell gesetzte Stufe und die letzten zwei lassen sich nicht löschen.
- **Setzen:** Recht `danger.set`; hat die Zielstufe berechtigte Rollen, muss der Handelnde eine davon haben – `danger.manage`/Administrator überstimmt. Optionaler Grund (≤ 300 Zeichen). Gleiche Stufe erneut setzen wird abgelehnt.
- **Statusmeldung:** In den Kanal „Gefahrenstatus-Kanal“ (neuer Auswahl-Slot `danger-channel`) schreibt der Bot ein Embed in Stufenfarbe; es wird bei jeder Änderung **bearbeitet**, bei gelöschter Nachricht neu gepostet. Schlägt das fehl, bleibt die Stufenänderung bestehen und die Antwort weist darauf hin.
- **Alles geloggt:** Stufe gesetzt (vorher/nachher, Grund, Recht), Stufen angelegt/geändert/gelöscht (vorher/nachher) im Audit-Log; zusätzlich Verlauf `danger_events`.
- Oberflächen: Bot `/gefahr anzeigen|setzen|verlauf` (Autocomplete); API `GET /guilds/:id/danger`, `history`, `POST set`, `PUT/DELETE levels/:level`; Dashboard mit aktueller Stufe, Setzen, Bearbeiten.

## Rechte
`danger.view` (Beamte, Leitung), `danger.set` (Polizeileitung), `danger.manage` (Serverleitung).

## Tests
`danger.test.ts` (6): Standardstufen (parallel), Konfiguration/Validierung/Löschschutz/Audit, Setzen mit Verlauf, Rollenbeschränkung + Überstimmen, Statusmeldung (posten/bearbeiten/neu posten/Fehler), Embed. Bot `gefahr.int.test.ts` (2).

## Grenzen
- Die Gefahrenstufe beeinflusst noch keine anderen Systeme (z. B. Einsatzpriorität); Live-Push ans Dashboard folgt in Phase 30 (bis dahin Aktualisierung alle 15 s).
- Mehrere Stufen mit gleicher Rolle/Konfiguration werden einzeln gepflegt (keine Vorlagen).
