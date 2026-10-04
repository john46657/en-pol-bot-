# Phase 27 – Tages- und Wochenberichte

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/reports`, Datenmodell, API, Bot `/bericht`, Dashboard „Berichte“. Tests gegen echte Datenbank. **Veröffentlichen nur mit Port-Attrappe getestet, Bot nur mit Attrappen, Dashboard nicht im Browser getestet, kein echtes Discord. Die automatische tägliche/wöchentliche Erstellung ist ausdrücklich Phase 31 (Hintergrund-Jobs)** – hier ist alles per Befehl/Dashboard auslösbar und die Funktionen (`generate`, `publish`) sind bereit.

## Inhalt
**Tagesbericht** (Berlin-Kalendertag) führt zusammen: **Schichten** (gestartet/beendet/laufend, aktive Beamte, Nettodauer, Durchschnitt, je Typ), **Einsätze** (neu/abgeschlossen/abgebrochen/offen, nach Priorität), **Fahndungen** (neu, Personen/Fahrzeuge, aufgehoben, aktiv gesamt), **Strafen** (Anzahl je Art, Bußgeldsumme und Punkte – nur aktive, aufgehobene separat), **Tickets** (eröffnet/geschlossen/offen), **Ausbildungen** (beendete Termine, bestanden/nicht bestanden).
**Wochenbericht** (Montag–Sonntag) zusätzlich: **aktivste Beamte** (Top 5), **Gesamtstunden**, **Beförderungen**, begonnene Abmeldungen und **Vergleich zur Vorwoche** (Dienstzeit, Schichten, Einsätze in Prozent).

## Regeln
- Zeiträume sind `[Beginn, Ende)` in Berlin-Zeit (auch bei Zeitumstellung); Schichten zählen im Zeitraum, in dem sie **begonnen** haben (wie Phase 13), Dienstzeit nur aus **beendeten** Schichten.
- Je Server, Art und Zeitraum wird **ein** Bericht gespeichert; erneutes Erzeugen überschreibt die Zahlen (Veröffentlichung bleibt verknüpft).
- **Veröffentlichen** in den Kanal „Berichte“ (Auswahl-Slot `report-channel`): erst posten, danach bearbeiten statt doppeln, bei gelöschter Nachricht neu; ohne Kanal oder bei Discord-Fehler wird das **ehrlich gemeldet** (Status `no-channel`/`failed` mit Grund).

## Abnahme „Zahlen stimmen mit den gespeicherten Datensätzen“
`reports.test.ts` legt bekannte Schichten, Einsätze, Fahndungen, Strafen, Tickets, Ausbildungen, Beförderungen und Abmeldungen über mehrere Tage/Wochen an (inkl. laufender Schicht, aufgehobener Strafe, Vorwoche, Berlin-Tagesgrenzen) und prüft jede Kennzahl einzeln, außerdem leere Tage, Idempotenz und die Darstellung.

## Rechte und Oberflächen
`report.view` (ansehen), `report.manage` (erzeugen, veröffentlichen). Polizeileitung hat beide; die Teamleitung-Vorlage ist team-beschränkt und reicht für diese serverweiten Berichte **nicht** aus. Bot: `/bericht tag|woche [datum] [veroeffentlichen]`, `/bericht liste`. API: `/guilds/:id/reports[/:id|:id/publish]`. Dashboard: Berichte berechnen (Datum frei wählbar), ansehen, veröffentlichen.

## Tests
`reports.test.ts` (7), Bot `bericht.int.test.ts` (2).

## Grenzen
- Berichte sind nicht teambezogen (immer serverweit) – Team-Berichte folgen bei Bedarf.
- „Statistiken“ des Wochenberichts sind die genannten Kennzahlen; weitere Auswertungen (z. B. Heatmaps) gibt es nicht.
- Kein PDF/CSV-Export (nur Text im Dashboard und Embed im Kanal).
