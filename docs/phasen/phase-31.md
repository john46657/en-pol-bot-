# Phase 31 – Automatisierung

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/jobs`, Worker mit allen Jobs, Job-Protokoll, Dashboard „Automatisierung“. Tests gegen echte Datenbank mit Discord-Attrappe. **Praxislauf:** Der Worker wurde real gegen Redis/Postgres gestartet – die Jobs ohne Discord-Zugriff liefen erfolgreich (und stehen in `job_runs`), die Jobs mit Discord-Zugriff schlugen **ohne Token wie vorgesehen sichtbar fehl**. **Nicht getestet:** Zustellung an echtes Discord (kein Token), Discord-Sync gegen die echte API (nur Fehlerpfad), Dashboard im Browser.

## Jobs (BullMQ, Job-Scheduler, alle Intervalle in `JOBS`)
| Job | Takt | Wirkung |
| --- | --- | --- |
| Benachrichtigungen | 1 Min | sendet fällige DMs/Kanalnachrichten aus der Warteschlange – **Wiederholung mit Backoff** (1/5/15/60/240 Min., max. 5 Versuche, danach `FAILED` mit Fehlertext); **nie doppelt** (Eindeutigkeitsschlüssel + Beanspruchen, auch bei parallelen Läufen) |
| Bewerbungs-Timeouts | 10 Min | offene, nicht eingereichte Bewerbungen laufen nach dem **Zeitlimit der Bewerbung** (`requirements.timeLimit`) ab → `EXPIRED`, Bewerber-DM, Audit (`submission.expired`, Automation) |
| Erinnerungen | 15 Min | Bewerber nach 24 h Inaktivität (nicht kurz vor/nach Ablauf), **Team** bei eingereichten Bewerbungen > 48 h unbearbeitet (Kanal „Bewerbungs-Eingang“), **Ausbildungstermine** 24 h vorher (Teilnehmer + Ausbilder), **Abmeldung endet** heute/morgen – jeweils **einmalig** |
| Tages-/Wochenberichte | 10 Min | Tagesbericht des Vortags, montags zusätzlich Wochenbericht der Vorwoche, veröffentlicht im Berichts-Kanal; **idempotent** (bereits Veröffentlichtes wird weder neu berechnet noch erneut gepostet – Ausfälle holen sich nach) |
| Statistiken & Leaderboards | 15 Min | je Server Ranglisten (Tag/Woche/Monat/Gesamt) und Übersicht als Snapshot (`stat_snapshots`) |
| Discord-Synchronisierung | 30 Min | Rollen und Kanäle aller Server per REST abgleichen (fängt verpasste Ereignisse ein); Fehler eines Servers stoppen nicht die anderen |
| Schichtwächter | 5 Min | (aus Phase 12) meldet zu lange Schichten |

## Robustheit
- **Job-Protokoll:** jeder Lauf mit Ergebnis oder Fehler in `job_runs` (die letzten 100 je Job); ein fehlschlagender Job beeinflusst die anderen nicht (je Job eigener Lauf, Concurrency 2).
- Fehlt der Discord-Token, laufen Jobs ohne Discord weiter; Benachrichtigungen **bleiben in der Warteschlange** und werden nach Behebung gesendet.
- Das Dashboard „Automatisierung“ zeigt Plan, letzten Lauf, Fehler und die Benachrichtigungs-Zahlen (inkl. fehlgeschlagener mit Grund). Recht `config.view`.

## Tests
`jobs.test.ts` (11): Dedupe/Zustellung, Backoff bis `FAILED`, geplante und parallele Zustellung, Bewerbungs-Timeout (mit Limit/ohne/innerhalb, idempotent, Audit), Bewerber-/Team-Erinnerung einmalig, Ausbildungs- und Abmeldungs-Erinnerungen, Berichte (Tag + montags Woche, kein Doppelpost), Snapshots stimmen mit Schichten überein, Sync-Fehlerpfad, Job-Protokoll.

## Grenzen
- Eine Verwaltungs-Oberfläche zum manuellen Anstoßen einzelner Jobs gibt es nicht (nur Warten auf den Takt).
- Die Snapshots werden noch nicht von der API/Bot als Cache genutzt (Phase 34).
- Berichtszeitpunkt hängt vom 10-Minuten-Takt ab (Veröffentlichung kurz nach Mitternacht Berlin).
