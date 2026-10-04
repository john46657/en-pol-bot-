# Phase 23 – Beförderungssystem

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/promotions`, Datenmodell, API, Bot `/befoerderung`, Dashboard „Beförderungen“. Tests gegen echte Datenbank. **Bot nur mit Attrappen, Rollenwechsel nur mit Fake-Rollentreiber, Dashboard nicht im Browser getestet, kein echtes Discord.**

## Voraussetzungen (automatisch geprüft)
Je Ziel-Dienstgrad eine Regel aus denselben Bausteinen wie bei Qualifikationen (Phase 22), erweitert um **Tage im aktuellen Dienstgrad** (seit der letzten Rangänderung) und **keine aktive Disziplinarmaßnahme in N Tagen**: bestandene Ausbildung, Qualifikation, Mindest-Dienstgrad, Dienstzeit, Dienststunden. Ohne Regel genügt die Genehmigung. Jede Voraussetzung wird mit Ist-Wert erklärt (`/befoerderung pruefen`, Dashboard).

## Ablauf
1. **Antrag** (`promotions.create`): nicht für sich selbst; nur auf einen **höheren** Dienstgrad; nur mit aktiver Akte; je Mitglied **ein** offener Antrag. Sind die Voraussetzungen nicht erfüllt, wird der Antrag abgelehnt – außer als **Ausnahme** mit Pflicht-Begründung (im Antrag markiert).
2. **Genehmigen** (`promotions.approve`): prüft die Voraussetzungen **erneut**, verhindert **veraltete** Anträge (Dienstgrad hat sich geändert), **Vier-Augen-Prinzip** (Antragsteller und Beförderte genehmigen nicht selbst, außer `promotions.manage`), setzt den Dienstgrad über die Personalakte **inkl. Rollenwechsel** (alte Dienstgrad-Rolle weg, neue da; Protokoll über `applyRoleChanges`), schreibt den Eintrag **„PROMOTION“** in die Akte und das Audit-Log. Das Rollen-Ergebnis steht am Antrag (ohne Discord-Zugang `null` – nicht als Erfolg ausgegeben).
3. **Ablehnen** (`promotions.reject`) mit Pflicht-Grund; **Zurückziehen** durch den Antragsteller (oder Verwalter). Danach ist ein neuer Antrag möglich.
- **Historie:** genehmigte Beförderungen je Mitglied (`/befoerderung historie`, Akte „Beförderungen“); alle Anträge mit Status, Entscheidung und Prüfergebnis bleiben erhalten.
- **Kandidaten:** automatische Prüfung der aktiven Akten (max. 300) auf den **nächsthöheren** Dienstgrad – im Bot und im Dashboard mit „Antrag stellen“.

## Rechte und Oberflächen
`promotions.view/create/approve/reject/manage` (Polizeileitung hat view/create/approve/reject; Teamleitung darf nicht genehmigen). Bot: `/befoerderung antrag|liste|info|genehmigen|ablehnen|zurueckziehen|pruefen|kandidaten|historie`. API: `/guilds/:id/promotions[/rules|candidates|check|history/:userId|:id/(approve|reject|withdraw)]`. Dashboard: Kandidaten, Anträge mit Prüfergebnis und Entscheidung, Regel-Editor je Dienstgrad.

## Tests
`promotions.test.ts` (7): Regeln und Einzelprüfung, Antrag-Validierung, Genehmigung mit Rolle/Akte/Historie/Vier-Augen/Doppelschutz, erneute Prüfung, veralteter Antrag, Ablehnen/Zurückziehen/Listen, Kandidaten. Bot `befoerderung.int.test.ts` (2).

## Grenzen
- Genehmigung ist einstufig (ein Genehmiger); mehrstufige Freigabeketten gibt es nicht.
- Kandidatenprüfung läuft bei jedem Aufruf neu (kein Cache, Phase 34) und ist auf 300 Akten begrenzt.
- Keine automatische Beförderung ohne Antrag (bewusst).
