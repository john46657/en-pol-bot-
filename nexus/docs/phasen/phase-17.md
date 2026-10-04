# Phase 17 – Einsatzsystem

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/operations`, Datenmodell, API, Bot `/einsatz`, Dashboard „Einsätze“, Übernahme in Personalakten. Tests gegen echte Datenbank. **Bot nur mit Attrappen, Dashboard nicht im Browser getestet, kein echtes Discord.**

**Abnahme „automatisch in Personal- **und Berichtssysteme** übernommen“:** *Personal* ist umgesetzt und getestet. Ein *Berichtssystem* gibt es erst mit Phase 27; bis dahin sind abgeschlossene Einsätze (Bericht, Beteiligte, Zeiten) vollständig gespeichert und über `listOperations`/`operationStats` (Zeitraum, Status, Priorität, Beteiligung je Beamter) abfragbar – Phase 27 liest daraus. Das ist **noch keine** fertige Berichts-Übernahme.

## Funktionen
- **Einsatznummer** `E-0001 …` fortlaufend je Server, atomar (parallel getestet).
- Ort, Priorität (niedrig/normal/hoch/dringend), Art, Beschreibung; Bearbeiten solange offen.
- **Status:** angefordert → angefahren → aktiv → abgeschlossen / abgebrochen (Wechsel-Tabelle, Endzustände endgültig; Anfahren/Aktiv/Abschluss nur mit zugewiesener Einheit; **Abschluss nur mit Abschlussbericht** ≥ 10 Zeichen, **Abbruch nur mit Grund**, Audit-Log).
- **Einheiten:** zuweisen/abziehen; eine Einheit nur in einem Einsatz gleichzeitig; sie steht dann auf „Im Einsatz“ (Phase 14) und bekommt am Ende ihren **früheren Status** zurück – außer jemand hat ihn inzwischen manuell geändert.
- **Einsatzleiter:** automatisch Streifenführer der ersten Einheit, änderbar auf ein Mitglied einer zugewiesenen Einheit.
- **Beteiligte** werden bei Zuweisung und beim Abschluss festgehalten; für jeden mit aktiver Personalakte entsteht **genau ein** Eintrag „OPERATION“ (Nummer, Art, Ort, Rolle, Bericht), idempotent. Die Akte zeigt „Einsätze“ (Dashboard). Abbruch schreibt nichts in Akten.
- Verlauf je Einsatz (`operation_events`).

## Rechte
`operations.view`, `operations.create` (Beamter, Leitung), `operations.manage` (Leitung). Im Bot dürfen zusätzlich **Beteiligte** den Status ändern bzw. Mitglieder einer Einheit diese dem Einsatz zuweisen.

## Oberflächen
Bot: `/einsatz neu|liste|info|zuweisen|leiter|status` (Autocomplete für Nummer/Einheit). API: `GET/POST /guilds/:id/operations`, `:id`, `:id/units`, `:id/leader`, `:id/status`, `stats`. Dashboard: Liste/Filter, Anlegen, Zuweisen, Status, Bericht.

## Tests
`operations.test.ts` (8): Nummern parallel, Pflichtfelder, Statusmaschine, kompletter Ablauf (Einheiten BUSY→AVAILABLE, Akten, Idempotenz, Verlauf), Abbruch, Status-Wiederherstellung, Abfragen/Kennzahlen. Bot `einsatz.int.test.ts` (2).

## Grenzen
- Spätere Streifenmitglieder werden nur beim Abschluss/bei der Zuweisung erfasst, nicht zwischendurch; wer vorher die Einheit verließ und nie erfasst wurde, fehlt.
- Dashboard zeigt Discord-IDs statt Namen; keine Live-Pushes (Phase 30), Aktualisierung alle 15 s.
- Gefahrenstatus/Fahndungen sind nicht mit Einsätzen verknüpft (Phasen 18/19).
