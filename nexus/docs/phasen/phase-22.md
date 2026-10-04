# Phase 22 – Qualifikationssystem

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/qualifications`, Datenmodell, API, Bot `/qualifikation`, Dashboard „Qualifikationen“. Tests gegen echte Datenbank. **Bot nur mit Attrappen, Rollenvergabe nur mit Fake-Rollentreiber, Dashboard nicht im Browser getestet, kein echtes Discord.** (Die Beispiel-Qualifikation „Leitstelle“ entfällt, weil es keine Leitstelle gibt.)

## Voraussetzungen (frei kombinierbar, je Qualifikation bis 15)
| Art | Prüfung |
| --- | --- |
| Ausbildung bestanden | `hasPassed` aus dem Ausbildungssystem (Phase 21) |
| Andere Qualifikation | aktive Vergabe vorhanden (Zyklen und Selbstbezug werden beim Speichern abgelehnt, Löschen verwendeter Qualifikationen verweigert) |
| Mindest-Dienstgrad | Rang-Reihenfolge der Personalakte |
| Dienstzeit | Tage seit Eintritt |
| Dienststunden | Summe der Nettodauern beendeter Schichten |

`checkEligibility` erklärt **jede Voraussetzung einzeln** (erfüllt/nicht, mit Ist-Wert) – im Bot (`/qualifikation pruefen|info`) und im Dashboard („Prüfen“).

## Vergabe
- **Manuell** (`qualification.manage`): nur wenn alle Voraussetzungen erfüllt sind; sonst **Ausnahme** mit Pflicht-Begründung, die in der Vergabe, im Audit-Log und im Akteneintrag steht. Doppelte Vergabe verhindert (auch parallel über Eindeutigkeitsschlüssel).
- **Automatisch** (`autoGrant`): nach jeder bestandenen Ausbildung (Hook aus Phase 21) werden alle Auto-Qualifikationen geprüft – auch Ketten (A ermöglicht B); idempotent; Audit-Eintrag als *Automation*.
- Je Vergabe: Eintrag **„QUALIFICATION“** in der Personalakte, optionale **Rolle** über `applyRoleChanges` (Fehler sichtbar im `roleResult`), optionale **Gültigkeit** (abgelaufene zählen nicht mehr und lassen sich neu vergeben).
- **Entzug** mit Pflicht-Begründung: Akteneintrag widerrufen, Rolle entfernt (nur wenn keine andere aktive Qualifikation sie noch verleiht), Audit-Log.

## Rechte und Oberflächen
`qualification.view` (ansehen, fremde Prüfung), `qualification.manage` (definieren, vergeben, entziehen); eigene Qualifikationen/Prüfung über `own.training.view`. Bot: `/qualifikation liste|meine|info|pruefen|vergeben|entziehen`. API: `/guilds/:id/qualifications[/me|member/:userId|:id/(holders|check|award)|awards/:id/revoke]`. Dashboard: Definition mit Voraussetzungs-Editor, Prüfen/Vergeben mit optionaler Ausnahme.

## Tests
`qualifications.test.ts` (6): Validierung/Zyklen/Löschschutz, alle fünf Voraussetzungsarten, Vergabe/Ausnahme/Akte/Rolle/Doppelt, Entzug und Neuvergabe, Gültigkeit, Automatik inkl. Kette. Bot `qualifikation.int.test.ts` (1).

## Grenzen
- Ablauf wird beim Lesen ausgewertet; ein automatischer Sweep mit Erinnerung vor Ablauf folgt mit den Hintergrund-Jobs (Phase 31).
- Die SEK-Qualifikationen im Rechtebereich `sek.*` sind nicht getrennt von diesem System; das SEK-Modul (Phase 24) baut darauf auf.
- Keine Dienstgrad-Obergrenze/Teamvoraussetzung (nur Mindest-Dienstgrad).
