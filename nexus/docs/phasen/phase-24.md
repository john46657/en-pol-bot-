# Phase 24 – SEK-System

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/sek`, Datenmodell, API, Bot `/sek`, Dashboard „SEK“. Tests gegen echte Datenbank. **Bot nur mit Attrappen, Dashboard nicht im Browser getestet, kein echtes Discord.** Der Plan-Punkt „mit Leitstelle verbinden“ entfällt (keine Leitstelle); die Verbindung zum Einsatzsystem besteht.

## Architektur: ein Modul, keine zweite Datenhaltung
Das SEK ist eine **Konfiguration** („SEK ↔ Team, Qualifikation, Shift-Typ, Ausbildungen, Bewerbung“) plus Ansichten und Regeln auf den vorhandenen Systemen:
| Plan-Punkt | Umsetzung |
| --- | --- |
| SEK-Personal | aktive Akten im **SEK-Team** (Personalverwaltung) mit Qualifikationsstand, Dienststatus, Einsatzteams |
| Aufnahme/Entfernung | Aufnahme = SEK-**Qualifikation** vergeben (aus Ausbildung; sonst Ausnahme mit Begründung) + Team setzen; Entfernen (Grund Pflicht) = Qualifikation entziehen, Team lösen, aus Einsatzteams streichen; Audit-Log |
| SEK-Shifts | eigener **Shift-Typ** (Rollenanforderung möglich); Auswertung/Rangliste gefiltert auf diesen Typ |
| SEK-Einsätze | normale Einsätze (Phase 17: Nummer, Status, Einheiten, Bericht, Akteneinträge) mit **SEK-Kennzeichen** (`SEK: …`); **Einsatzteams** (Trupps mit Funktionen) lassen sich zuordnen |
| Einsatzteams | Trupps „Alpha“ … mit Leiter und Funktionen (Einsatzleiter, Scharfschütze …); nur SEK-Mitglieder |
| SEK-Ausbildungen | Ausbildungen aus Phase 21, als SEK-Kurse markiert; Termine anlegen mit `sek.training.manage` (nur für SEK-Kurse) |
| SEK-Funk | `syncRadio`: alle qualifizierten SEK-Mitglieder erhalten **Spezialfunk** (Phase 16); höhere Stufen bleiben, idempotent |
| SEK-Statistiken | Mitglieder/qualifiziert/im Dienst, Dienstzeit-Rangliste (SEK-Shift-Typ, nur SEK-Team), Einsätze nach Status, Ausbildungen bestanden |
| SEK-Bewerbungen | Einreichungen der verknüpften Bewerbung (Übersicht; Bearbeitung im Bewerbungssystem) |

## Rechte (`sek.*` aus dem Katalog)
`sek.view` (ansehen), `sek.member.manage` (aufnehmen/entfernen, Einsatzteams, SEK-Einsätze, Funk), `sek.training.view/manage`, `sek.application.view`, `sek.manage` (Konfiguration; Serverleitung). `sek.qualification.*` bleibt dem Qualifikationssystem überlassen. Bot `/sek …`, API `/guilds/:id/sek/…`.

## Tests
`sek.test.ts` (7): Konfiguration/Validierung, Aufnahme (Ausbildung/Ausnahme), Entfernen, Einsatzteams, SEK-Einsatz mit kompletter Einsatz-Pipeline und Akte, Spezialfunk-Sync, Ausbildungen + Statistik. Bot `sek.int.test.ts` (2).

## Grenzen
- Ohne Konfiguration (Team + Qualifikation) sind Personal-Funktionen gesperrt (klare Meldung).
- Einsatzteams sind Planungsgruppen; die Einsatz-Einheiten (Streifen) weist weiterhin das Einsatzsystem zu.
- Spezialfunk-Sync ist ein Knopfdruck, keine Dauer-Synchronisation (Phase 31 kann ihn planen).
