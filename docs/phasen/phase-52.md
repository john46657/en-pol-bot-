# Phase 52 – Bot-Befehle für Dashboard-Funktionen

**Stand:** abgeschlossen (2026-10-05). Was im Dashboard seit Phase 46–51 möglich ist, geht jetzt auch im Discord.

## Neu
- **`/personal status|schliessen|wiederherstellen|nummer`** – Teamstatus setzen (aktiv, Pause, außer Dienst, suspendiert; Suspendierung nur mit Grund), Akte schließen (Grund Pflicht, Akte und Historie bleiben), Akte wiederherstellen, Dienstnummer vergeben oder korrigieren (ohne Angabe: nächste freie). Rechte wie im Dashboard (`personnel.state.edit`, `personnel.archive`, `personnel.number.edit`, serverweit oder nur eigenes Team). Für unbekannte Mitglieder und ohne Recht kommt dieselbe Antwort – es wird nichts über fremde Akten verraten.
- **`/sperre verhaengen|aufheben|liste|pruefen`** – Bewerbungs-, Ticket-, Fraktions- und Funksperren verhängen (Dauer in Stunden oder unbefristet, Grund Pflicht, Notiz), mit ID aufheben (Grund Pflicht), auflisten und je Mitglied prüfen. Rechte `restrictions.create/revoke/view`.
- **`/akte`** zeigt jetzt den Zustand (Aktiv, Pause, Außer Dienst, Suspendiert, Geschlossen).

## Befehlsübersicht (Bot ↔ Dashboard)
Fahndung `/fahndung` · Ticket `/ticket` (inkl. `wartet`, Schließen mit Pflichtgrund) · Akte `/akte`, Personal `/personal` · Sperren `/sperre` · Schicht/Streife/Funk/Einsatz/Gefahr · Ausbildung `/ausbildung`, Beförderung `/befoerderung`, Abmeldung `/abmeldung`, Qualifikation, Strafen, Fuhrpark, SEK, Büro, Bericht, `/health`. Rein im Dashboard bleiben: Design-Editor, Rollen-/Rechteverwaltung, Bewerbungs-Editor, Dienstgrade/Teams-Struktur, Einstellungen.

## Tests
Bot 147 (`personal-sperre.int.test.ts`: Rechte, Pflichtgründe, Zustandswechsel, geschlossene Akte, Dienstnummer, unbekanntes Mitglied, Sperre verhängen/prüfen/listen/aufheben, `/akte`-Anzeige).

## Grenzen
- Befehle wurden nicht gegen einen echten Discord-Bot ausgeführt (kein Test-Token); getestet ist die Befehlslogik mit nachgebildeten Eingaben. Nach dem Start registriert der Bot sie global – das dauert bei Discord bis zu einer Stunde.
- Kein Befehl für Dienstgrad-Struktur, Design oder Rechteverwaltung (bewusst nur Dashboard).
