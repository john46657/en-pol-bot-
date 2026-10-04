# Phase 13 – Shift Leaderboards & Statistiken

**Stand:** abgeschlossen (2026-10-04) – Auswertung in `@nexus/shifts` (`stats.ts`), API, Bot, Dashboard. Gegen echte Datenbank getestet; **Dashboard nicht im Browser durchgeklickt, Bot nur mit Attrappen**.

## Regeln der Auswertung
- Grundlage sind ausschließlich gespeicherte, **beendete** Schichten (Nettodauer). Laufende Schichten zählen erst nach dem Ende.
- Eine Schicht zählt **vollständig** in den Zeitraum, in dem sie **begonnen** hat (keine Zerteilung über Mitternacht).
- Tag/Woche/Monat gelten in der Zeitzone **Europe/Berlin** (inkl. Sommer-/Winterzeit; Test: 25-Stunden-Tag), Woche beginnt **Montag**. „Gesamt“ hat keine Grenzen.
- Je Zeitraum: Anzahl, **Gesamtzeit**, **Durchschnitt** (gerundet auf Sekunden).
- **Leaderboard:** nach Gesamtzeit, bei Gleichstand mehr Schichten, dann Mitglieds-ID (stabil). Optional nach Typ gefiltert; Team-Bereich der Rechte wird beachtet. `rankOf` liefert den Platz auch außerhalb der Top-N.

## Oberflächen
- **Bot:** `/schicht status` zeigt Heute/Woche/Monat/Gesamt und den Wochenplatz; `/schicht rangliste [zeitraum]` (Recht `shifts.view`).
- **API:** `GET /guilds/:id/shifts/overview`, `/leaderboard?period=&limit=&typeId=`; `/shifts/me` enthält Übersicht und Wochenplatz.
- **Dashboard:** Seite „Schichten“ mit Auswertungskarten und Rangliste.

## Abnahme
„Werte stimmen mit den gespeicherten Shifts überein“: `test/stats.test.ts` legt bekannte Schichten an (Tag-, Wochen-, Monats-, Vormonat-, Grenzfall 00:30 Berlin/UTC noch Vormonat, laufende Schicht) und prüft Summen, Zähler, Durchschnitt, Plätze und Team-Filter.

## Grenzen
- Zeitzone ist fest Europe/Berlin (Parameter `tz` vorhanden, aber noch nicht pro Server einstellbar).
- Rangliste zeigt Discord-IDs im Dashboard (Namensauflösung folgt mit Phase 30).
