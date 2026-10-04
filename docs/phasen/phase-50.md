# Phase 50 – Benachrichtigungsarten und Server-Verlassen (Spezifikation 53–54)

**Stand:** abgeschlossen (2026-10-04).

## Benachrichtigungen (Glocke im Header, Quelle Audit-Log, je Art ein Recht)
Neu zu den bisherigen (Neues Ticket, Neue Bewerbung, angenommen, abgelehnt, Ticket wartet, Teamänderung, Systemeinstellungen):
| Art | Audit-Aktion | Recht |
|---|---|---|
| Ticket übernommen/zugewiesen | `ticket.claimed` | `tickets.view` |
| Ticket geschlossen | `ticket.closed` | `tickets.view` |
| Neue Ausbildung | `training.created` | `training.view` |
| Ausbildung abgeschlossen | `training.finished`/`passed` | `training.view` |
| Neue Fahndung | `wanted.created` | `wanted.view` |
| Sperre erstellt / abgelaufen | `restriction.created`/`expired` | `restrictions.view` |
| Rollenänderung | `role.change` (zuvor Teil von „Teamänderung“) | `personnel.view` |
| Mitglied hat den Server verlassen | `member.left` | `personnel.view` |

„Ticket wartet“ umfasst jetzt auch den neuen Status (`ticket.waiting`). Wer die Glocke sieht, wird wie bisher serverseitig nach Recht gefiltert; im Design-Editor lassen sich die Arten abwählen. Die Bezüge führen zu Ticket, Bewerbung bzw. der passenden Seite.

## Server verlassen (Punkt 54)
- Der **Dashboard-Zugriff entfällt sofort**: Die API prüft die Mitgliedschaft und die Rollen bei jeder Anfrage live bei Discord (Zwischenspeicher höchstens 60 s). Nicht-Mitglieder erhalten 403 „Du bist nicht (mehr) Mitglied dieses Servers.“ ohne Daten; entzogene Rollen wirken ebenso spätestens nach 60 s.
- Der Bot vermerkt das Verlassen: Audit `member.left` (automatisch, mit Bezug zur Personalakte, falls vorhanden) und Eintrag im Verlauf der aktiven Akte. Die Akte wird **nicht** automatisch geschlossen.

## Tests
- Design 111 (Zuordnung aller Arten, rechtegefilterte Lieferung, Auswahl), Bot 142 (`member-left.int.test.ts`: mit/ohne Akte, geschlossene Akte, Servertrennung), API-E2E 193 (Nicht-Mitglied 403 auf fünf Endpunkten), Browser: „Sperre erstellt“ erscheint in der Glocke.

## Grenzen
- Die Glocke liest das Audit-Log; es gibt **keine** Push-Benachrichtigung (kein Ton, keine Discord-DM) – nur die Anzeige im Dashboard (Lesestatus je Browser).
- Bereits gespeicherte Themes behalten ihre gewählten Arten; **neue Arten sind dort aus**, bis sie im Design-Editor (Header → Benachrichtigungen) aktiviert werden. Neue Themes haben alle.
- Der 60-Sekunden-Zwischenspeicher gilt je API-Prozess; eine sofortige Sperrung des Zugriffs vor Ablauf ist nicht möglich.
- Nicht gegen einen echten Discord-Bot geprüft (Mitgliedsereignis getestet über die Funktion, nicht über Discord).
