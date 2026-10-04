# Phase 49 – Ticket-Status und Pflicht-Schließungsgrund (Spezifikation 15–16)

**Stand:** abgeschlossen (2026-10-04).

## Umsetzung
- **Status:** `OPEN`, `IN_PROGRESS`, `WAITING`, `CLOSED`. Der bisherige Status `CLAIMED` (übernommen) heißt jetzt **`IN_PROGRESS`** (Migration benennt den Wert um, bestehende Tickets bleiben gültig); neu ist **`WAITING`** („wartet auf Rückmeldung“).
- **Wechsel:** Übernehmen → `IN_PROGRESS`; „Wartet auf Rückmeldung“ → `WAITING` (Bearbeiter bleibt erhalten, im Kanal wird der Ersteller erwähnt); „Weiter bearbeiten“ → `IN_PROGRESS` bzw. `OPEN`, wenn niemand übernommen hat; Freigeben → `OPEN`. Nur Bearbeiter der Kategorie (bei „nur Bearbeiter“ exklusiv); geschlossene Tickets nicht. Ereignisse `waiting`/`resumed` im Verlauf. Wartende Tickets zählen als offen (Kapazität, Panel, Listen, Berichte, Dashboard-Widgets, Suche).
- **Schließungsgrund Pflicht:** `closeTicket` verlangt 3–300 Zeichen, sonst Fehler und das Ticket bleibt offen. Vorschläge (`CLOSE_REASONS`: Problem gelöst, Anfrage erledigt, Bewerbung bearbeitet, Kein weiterer Kontakt, Doppelt, Sonstiger Grund; API `GET tickets/close-reasons`) plus freier Text. Gespeichert: Grund, Schließer, Zeit, Transcript (bereits vorhanden).
- **Oberflächen:** Dashboard (Status-Anzeige, Knopf „Wartet auf Rückmeldung/Weiter bearbeiten“, Grundfeld mit Vorschlägen, „Schließen“ erst mit Grund); API `POST tickets/:id/waiting`; Bot `/ticket wartet`, `/ticket statistik` mit Wartend-Zähler, Schließen-Knopf öffnet jetzt immer das Pflicht-Formular (ersetzt die Rückfrage „Ticket schließen?“).

## Tests
- `@nexus/tickets` 30 (Statuswechsel, nur Bearbeiter, wartend = offen, Schließen mit Grund), API-E2E 192, Bot 140 (Schließen-Formular, leere Eingabe abgelehnt), Browser (`ticket-status.spec.ts`): übernehmen → wartend → weiter → Schließen erst mit Grund → Archiv. Bestehende Tests wurden auf den Pflichtgrund angepasst.

## Grenzen
- Antwortet der Ersteller im Ticket-Kanal, wechselt der Status **nicht automatisch** zurück (der Bot liest Kanalnachrichten nicht mit); das macht der Bearbeiter.
- Die Slash-Option `grund` bleibt bei `/ticket schliessen` formal optional (Discord verlangt Pflichtoptionen vor optionalen); fehlt sie, meldet der Befehl den Pflichtgrund.
- Die Einstellung „Schließen mit Grund“-Knopf ist jetzt überflüssig, bleibt aber bestehen.
- Offene Tickets, die in der Datenbank schon `CLAIMED` hatten, sind durch die Umbenennung automatisch `IN_PROGRESS`. Nicht gegen echten Discord-Bot geprüft.
