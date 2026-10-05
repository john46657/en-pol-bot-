# Phase 64 – Fraktionssperre wirksam

Bekannte Grenze aus Phase 47: Die Fraktionssperre ließ sich verhängen, wirkte aber nirgends.

## Umgesetzt
- „Fraktion beitreten“ ist im Bot die Aufnahme ins Team. Eine aktive Fraktionssperre (Sperren-System, mit Start/Ende) verhindert jetzt:
  - **Personalakte anlegen** und **archivierte Akte wiederherstellen** (`@nexus/personnel`),
  - **Team zuweisen** (Entfernen aus einem Team bleibt möglich),
  - **Annahme einer Bewerbung**, deren Annahme eine Personalakte anlegt (Schritt „Personalakte“ nicht abgeschaltet); Ablehnen bleibt möglich; Testbewerbungen sind ausgenommen.
- Meldung für das Team: „Für diesen Benutzer besteht eine Fraktionssperre bis … (Grund: …)“ bzw. „Annahme nicht möglich: …“. Nach Ablauf oder Aufheben der Sperre ist alles wieder möglich.
- **Tests:** `packages/personnel/test` (Anlegen, Team, Ablauf, fremde Sperre), Bot `review.int.test.ts` (Annahme gesperrt, Ablehnung möglich).
