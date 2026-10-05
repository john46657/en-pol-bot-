# Phase 65 – Sperr-Benachrichtigungen, befristete Banns, Ablauf temporärer Rechte

Offene Punkte aus früheren Phasen bzw. der Spezifikation.

## Umgesetzt
- **Sperren (Spezifikation 53):** Die gesperrte Person erhält eine DM bei **Verhängen** (Art, ggf. Start, Ende, Grund), **Aufheben** und **Ablauf** – über die Benachrichtigungs-Warteschlange (Wiederholung, nie doppelt). Neuer Audit-Bereich „Sperren“, damit das Team Sperren per Log-Weiterleitung in einen Kanal bekommen kann.
- **Befristete Banns:** `/mod ban … tage:` bzw. Dashboard-Feld „Befristet: Dauer in Tagen“ (1 Stunde bis 365 Tage über die API). Ende im Fall gespeichert und in der DM genannt. Worker-Job `moderation-expiry` (alle 5 Min.) hebt fällige Banns bei Discord auf (Fall → abgelaufen, Audit `moderation.ban_expired`); schlägt das Aufheben fehl, bleibt der Fall aktiv und wird erneut versucht.
- **Temporäre Rechte (Spezifikation „Rollen & Rechte“ 15):** Worker-Job `permission-expiry` (alle 5 Min.) löscht abgelaufene Benutzer-Ausnahmen und befristete Mitgliedschaften in Dashboard-Rollen und protokolliert jede Entfernung (vorher wurden sie nur ignoriert).
- **Tests:** `packages/restrictions/test` (DMs bei Verhängen/Aufheben/Ablauf), `packages/moderation/test` (Dauer, Ende, Aufheben nach Ablauf, Wiederholung bei Fehler), `packages/jobs/test/permission-expiry.test.ts`.
