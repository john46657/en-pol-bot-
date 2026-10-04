# Phase 48 – Team-Zustände (Spezifikation 30–31)

**Stand:** abgeschlossen (2026-10-04).

## Umsetzung
- **Zustände:** `ACTIVE` 🟢, `PAUSE` 🟡, `OFF_DUTY` 🔴, `SUSPENDED` ⚫ (neues Feld `teamState` an der Personalakte, mit Grund, Zeit, Benutzer) und **`CLOSED` ⚪ = Akte archiviert** (`status = ARCHIVED`). Der angezeigte Zustand (`effectiveState`) ist bei archivierter Akte immer CLOSED. So bleibt alles, was an „aktiv/archiviert“ hängt (Listen, Schichten, Automatisierung), unverändert.
- **Wechsel:** `POST personnel/:id/state` (Recht `personnel.state.edit` „Teamstatus ändern“, im Leitungs-Template). Suspendieren braucht einen Grund; gleicher Zustand → 409; geschlossene Akte → 409 (erst wiederherstellen); CLOSED ist hier nicht setzbar, nur über „Akte schließen“. Jeder Wechsel steht im Verlauf der Akte (`state.changed`, vorher/nachher/Grund).
- **CLOSED:** Schließen verlangt jetzt einen **Pflicht-Grund** (3–300 Zeichen); gespeichert werden Grund, Zeitpunkt und `archivedBy`. Akte, Einträge und Historie bleiben erhalten. Wiederherstellen setzt den Zustand auf aktiv und löscht Schließungsdaten.
- **Wirkung:** Wer suspendiert ist oder dessen Akte geschlossen ist, kann **keine Schicht starten**. Pause und außer Dienst sperren nichts.
- **Dashboard:** Zustand als Etikett in Akte und Liste, Auswahl „Teamstatus“ (nur mit Recht, nicht bei geschlossener Akte), „Akte schließen“ mit Pflichtgrund, Anzeige von Schließungsgrund, Benutzer, Datum.

## Tests
- `@nexus/personnel`: 30 (Grundpflicht, Zustandswechsel, Suspendierung, geschlossen gesperrt, Wiederherstellen); `@nexus/shifts`: 39 (Schichtstart); API-E2E 191 (Rechte, Wechsel, Pflichtgründe); Browser (`teamstate.spec.ts`): Pause → Suspendiert (Prompt „Pflicht“) → Schließen → Wiederherstellen.

## Grenzen
- Die Ersatz-Statusnamen sind deutsch/englisch gemischt in der Oberfläche; `PAUSE` heißt in der Schichtverwaltung getrennt `PAUSED` (andere Bedeutung: Schicht pausiert).
- Zustände wirken nur auf den Schichtstart; Dienst-/Streifen-, Funk- und Einsatzlogik prüfen sie nicht. Keine Benachrichtigung beim Wechsel.
- Die Teamliste automatisch aus Discord-Rollen (Punkt 29) gibt es weiterhin nur über die bestehende Rollen-/Teamzuordnung; Zustände werden nicht aus Discord abgeleitet.
- „Benutzer“ erscheint als Discord-ID. Bot-Befehl `/akte` zeigt den Zustand nicht.
