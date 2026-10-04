# Phase 21 – Ausbildungssystem

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/training`, Datenmodell, API, Bot `/ausbildung`, Dashboard „Ausbildung“, Anbindung an Personalakten und Rollen. Tests gegen echte Datenbank. **Bot nur mit Attrappen, Rollenvergabe nur mit Fake-Rollentreiber, Dashboard nicht im Browser getestet, kein echtes Discord.**

## Modell
`training_courses` (Ausbildung/Vorlage: Theorie-, Praxis-, Prüfungs-Maximalpunkte, Bestehensgrenze, Rolle bei Bestehen, Anmelde-Rollen, Platzzahl), `trainings` (Durchführung/Termin mit Nummer `T-0001`, Ausbildern, Status geplant → läuft → beendet / abgesagt), `training_participants` (Anmeldung, Punkte je Teil, Prozent, Status angemeldet/bestanden/nicht bestanden/abgemeldet/entfernt), `training_events` (Verlauf).

## Regeln (reine Funktion `evaluate`, getestet)
- Teile mit Maximum 0 entfallen. Ergebnis erst, wenn **alle** vorhandenen Teile bewertet sind.
- **Bestanden** = Gesamtprozent ≥ Grenze **und** (bei vorhandener Prüfung) Prüfung einzeln ≥ Grenze.
- Die Bewertung ist korrigierbar: dreht sich das Ergebnis, wird der Personalakten-Eintrag widerrufen bzw. angelegt und die Rolle entfernt bzw. vergeben (alles protokolliert).

## Ablauf und Rechte
- **Ausbildungen anlegen/ändern:** `training.create`/`training.edit`; Löschen nur ohne Termine (sonst deaktivieren).
- **Termine anlegen:** `training.create`; **Ausbilder zuweisen:** `training.trainer.manage`.
- **Anmelden/Abmelden:** Mitglieder mit `own.training.view`/`training.view` – prüft Anmelde-Rollen, Platzlimit, Doppelbuchung derselben Ausbildung, bereits bestanden; Ausbilder können Mitglieder anmelden oder mit Grund entfernen.
- **Starten, bewerten, beenden:** `training.session.manage` **und** Ausbilder dieses Termins (oder `training.manage`); die **Prüfung** zusätzlich `exam.manage`. Beenden geht nur, wenn alle angemeldeten Teilnehmer vollständig bewertet sind (die Fehlermeldung nennt, wer was noch braucht).
- **Absagen:** Ausbilder oder `training.manage`, Grund Pflicht, Audit-Log.

## Automatik bei Bestehen
- Eintrag **„TRAINING“** in der Personalakte (Ausbildung, Prozent, Termin) – sichtbar im Dashboard unter „Einsätze, Strafen & Ausbildungen“.
- **Automatische Rolle** über `applyRoleChanges` (Protokoll, verständliche Fehler); schlägt Discord fehl, bleibt das Ergebnis bestehen, `roleResult` hält `add:failed` fest und Bot/Dashboard weisen darauf hin.
- `hasPassed`/`progressOf` stehen Phase 22 (Qualifikationen) und 23 (Beförderung) zur Verfügung.

## Oberflächen
Bot: `/ausbildung liste|meine|info|anmelden|abmelden|neu|ausbilder|start|bewerten|ende|absagen` (Datum `TT.MM.JJJJ HH:MM` in Berlin-Zeit, Autocomplete). API: `/guilds/:id/training[/courses|me|:id/(trainers|enroll|remove|start|grade|finish|cancel)]`. Dashboard: Termine mit Punkteingabe, Ausbildungen, Termin anlegen.

## Tests
`training.test.ts` (13): Bewertungsregeln (Grenzfälle, entfallende Teile), Vorlagen-Validierung/Löschschutz, Nummern parallel, Anmeldung (Rolle/Platz/Doppelbuchung/Abmelden), kompletter Ablauf mit Akte und Rolle, Korrekturen in beide Richtungen, Rollenvergabe-Fehler, Wiederholung nach Durchfallen, Absagen, Datumsparser. Bot `ausbildung.int.test.ts` (2).

## Grenzen
- Keine Zeit-Erinnerungen/Auto-Start (Phase 31); Terminangabe im Dashboard in lokaler Browserzeit.
- Theorie-/Praxis-Teile sind reine Punktwerte (kein Fragenkatalog, keine Online-Prüfung).
- Ausbilder werden per Discord-ID gesetzt (im Dashboard ohne Namenssuche).
