# Phase 59 – Moderation (Verwarnen, Timeout, Kick, Bann)

Aus der Spezifikation „Rollen- & Rechtesystem“ (Rechte `moderation.view/manage/warn/kick/ban/timeout`).

## Umgesetzt
- **Paket `@nexus/moderation`:** Maßnahmen als nummerierte Fälle (Fallnummer je Server), Grund Pflicht (3–300 Zeichen), Moderator, Ergebnis, DM-Status; Audit-Einträge `moderation.warn|timeout|kick|ban|revoke` (Bereich „Moderation“ im Audit-Log und in der Log-Weiterleitung).
- **Schutzregeln:** nie gegen sich selbst, den Bot oder den Serverbesitzer; nur gegen Mitglieder, deren höchste Rolle **unter** der eigenen steht (Besitzer ausgenommen); für Timeout/Kick/Bann muss auch die Bot-Rolle höher stehen. Timeout/Kick nur für Mitglieder, Bann auch für Nicht-Mitglieder (per ID). Ein Benutzer kann nicht doppelt gebannt werden.
- **Ablauf:** Zuerst Discord, dann der Fall – schlägt Discord fehl (z. B. 403), entsteht kein Fall, nur ein Audit-Eintrag „failed“ mit verständlicher Meldung. Vor Kick/Bann geht eine DM an den Benutzer (best effort, Ergebnis wird festgehalten).
- **Timeout:** 1 Minute bis 28 Tage; ein neuer Timeout ersetzt den alten; Ablauf wird nachgezogen (`EXPIRED`).
- **Aufheben:** Verwarnung zurücknehmen, Timeout entfernen, Bann aufheben (Unban); Grund Pflicht; ein Kick lässt sich nicht aufheben; nicht gegen sich selbst; schlägt Discord fehl, bleibt der Fall aktiv.
- **Rechte:** `moderation.view`, `.warn`, `.timeout`, `.kick`, `.ban`, `.revoke`, `.manage` (alles); Seitenrecht `dashboard.moderation` (nur ansehen).
- **API:** `guilds/:id/moderation` (`types`, `cases`, `users/:userId`, `POST cases`, `POST cases/:id/revoke`); das Recht für `POST cases` hängt von der Maßnahme ab.
- **Bot:** `/mod warn|timeout|kick|ban|aufheben|akte` mit denselben Regeln und Rechten.
- **Dashboard:** Seite „Moderation“ (Filter, Fälle, Aufheben mit Grund, Maßnahme verhängen; Bestätigung bei Kick/Bann).
- Migration `20261005070000_moderation`; `timeoutGuildMember`, `kickGuildMember`, `banGuildMember`, `unbanGuildMember` in `@nexus/discord`.

## Tests
`packages/moderation/test` (13: Schutzregeln, Eingaben, Nummern, DM, Discord-Fehler, Aufheben, Zusammenfassung), `apps/bot/test/mod.int.test.ts`, Browser-Tests `e2e/moderation.spec.ts` (Oberfläche gegen Fake-Discord: verwarnen, Timeout, Kick, Bann, Aufheben samt Wirkung bei Discord; Rechte je Maßnahme, Rangfolge, Besitzerschutz, Selbstschutz über die API). Suite: 27 Browser-Tests, zweimal in Folge grün.

## Grenzen
- Nie gegen einen echten Discord-Server getestet (Fake-Discord); echte Antworten (Rollenposition, Rate Limits) können abweichen.
- Seit Phase 65 gibt es befristete Banns; keine automatische Moderation (Spam-/Wortfilter), keine Einsprüche.
- Moderation ist nur über Dashboard und `/mod` möglich; Maßnahmen, die direkt auf Discord ausgeführt werden, erscheinen nicht als Fälle.
- Mitgliedersuche (`GET moderation/members`, `moderation.view`) liefert nur ID und Namen, ab 2 Zeichen.
