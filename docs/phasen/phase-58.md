# Phase 58 – Logs-Modul: Weiterleitung des Audit-Logs in Discord-Kanäle

Aus der Spezifikation „Rollen- & Rechtesystem“ (Punkte 4, 18: „Logs konfigurieren“, `logs.view`, `logs.manage`).

## Umgesetzt
- **Weiterleitung:** Je Bereich des Audit-Logs (Bewerbungen, Tickets, Rollenänderungen, … oder „Alle Bereiche“) ein Discord-Textkanal, einzeln an/aus. Neue Einträge werden als Embed gesendet (Aktion, wer, Datensatz, Ergebnis, Grund) – **ohne** Vorher/Nachher-Inhalte.
- **Zustellung:** Job `log-forward` (alle 30 s) legt Einträge in die vorhandene Benachrichtigungs-Warteschlange: Wiederholung mit Backoff bei Discord-Fehlern, nie doppelt (`dedupeKey`). Cursor (Zeit + ID) je Server; beim ersten Aktivieren beginnt die Weiterleitung **ab jetzt** (kein Verlauf), gleiche Zeitstempel gehen nicht verloren.
- **Rechte:** `logs.view` (Konfiguration ansehen), `logs.manage` (ändern). `audit.view` und `dashboard.logs` genügen zum Ansehen, `logs.view`/`logs.manage` öffnen auch das Audit-Log. Änderungen der Weiterleitung stehen selbst im Audit-Log (`config.logs.forward.update`, vorher/nachher).
- **Prüfung:** Kanal muss ein Textkanal dieses Servers sein; jeder Bereich höchstens einmal.
- **Dashboard:** Logs-Seite → „Weiterleitung in Discord-Kanäle“.
- Migration `20261005060000_log_forwards`.

## Bewusst nicht umgesetzt
- **`logs.delete`:** Das Audit-Log ist append-only (Nachvollziehbarkeit, Spezifikation 17: niemand löscht eigene Einträge). Es gibt daher kein Löschen und kein Recht dafür.

## Tests
`packages/jobs/test/log-forward.test.ts` (Bereiche, kein Verlauf, kein Doppelversand, deaktiviert, gleiche Zeitstempel, keine Inhalte), Sammelrechte, Browser-Test in `e2e/rights-dashboard.spec.ts` (Oberfläche, Lesen vs. Ändern, fremder Kanal 400).

## Grenzen
- Nie gegen einen echten Discord-Kanal getestet (Fake-Discord bzw. Warteschlange); ob der Bot im Kanal schreiben darf, wird beim Speichern nicht geprüft – Fehler zeigen sich als fehlgeschlagene Benachrichtigung.
- Bis zu 30 s Verzögerung; höchstens 100 Einträge je Lauf und Server (Rest folgt im nächsten Lauf).
- Fachmodule schreiben nur, was sie ohnehin ins Audit-Log schreiben; „Server-Ereignisse“ wie Nachricht gelöscht oder Mitglied beigetreten werden nicht protokolliert.

## Nebenbefund: sporadisch fehlschlagender Browser-Test
`design-search.spec.ts` schlug in Gesamtläufen zufällig fehl: Der Besitzer-Benutzer stieß am Ende eines Minutenfensters an die Grenze „alle Anfragen“ (600/min, HTTP 429, `retry-after: 1`). Das Limit bleibt in Produktion unverändert; neu ist `RATE_LIMIT_FACTOR` (Standard 1, nur >1 wirkt, höchstens 100), den nur `playwright.config.ts` auf 10 setzt (`apps/api/src/common/security/rate-limit.ts`, Test in `security.test.ts`). Außerdem heißt der Rechte-Browser-Test jetzt `rights-dashboard.spec.ts`, damit er nach `design-search.spec.ts` läuft (seine `permissions.*`-Audit-Einträge erscheinen in der Glocke). Danach drei Gesamtläufe in Folge grün (25 Tests).
