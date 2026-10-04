# Phase 10 – Bewerbungsbearbeitung & Rollen

**Stand:** abgeschlossen (2026-10-04) – gemeinsame Logik für Bot und Dashboard, Tests gegen echte Datenbank + Redis (Discord als Attrappe), HTTP-Test der Dashboard-API gegen Fake-Discord, Browser-Test der Detailseite. **Nicht gegen echtes Discord getestet.**

## Befund (Fehler im Bestand, behoben)
1. **Annehmen/Ablehnen war im Bot nie möglich:** die Zustandsmaschine erlaubte `SUBMITTED → ACCEPTED/DENIED` nicht, und nichts setzte je `UNDER_REVIEW`. Jeder Klick endete mit „kann nicht mehr bewertet werden“.
2. **Nach dem Absenden wurde nichts an das Team gepostet** (keine Review-Nachricht, keine Benachrichtigung der Bearbeiter).
3. **Der Bewerber erhielt keine Nachricht** über Annahme/Ablehnung.
4. **Die Dashboard-API entschied am System vorbei:** nur Datenbank-Update, keine Statusprüfung, keine Rollenvergabe, keine Benachrichtigung – zwei verschiedene Wege für dieselbe Entscheidung.
5. **Berechtigungen vermischt:** jede Review-Aktion prüfte „irgendein Review-Recht“; wer nur ablehnen durfte, konnte annehmen.
6. **Doppelte Entscheidungen** waren möglich (kein atomarer Statuswechsel).
7. **Phase 3:** die Ereignis-Anbindung für Rollen/Kanäle/Mitglieder fehlte im Bot (siehe Korrektur in phase-3.md).

## Umsetzung
Gemeinsame Logik in `@nexus/automation` (`application-review`), genutzt von Bot **und** API über REST (`DiscordPort`; in Tests eine Attrappe).

| Bereich | Verhalten |
| --- | --- |
| Eingang (Abschnitt 62) | Absenden → Hauptnachricht im Bearbeitungskanal mit Kopf-Embed, Ping der Prüfer-Rolle und den Schaltflächen **Ansehen · Annehmen · Ablehnen · Rückfrage · Gespräch** (+ Verlauf, Notiz, Dashboard-Link); Antworten folgen als Nachrichten (nichts abgeschnitten). Kein Kanal konfiguriert oder keine Schreibrechte → Fehler im Audit-Log, Bewerbung bleibt gültig |
| Ansehen | setzt `UNDER_REVIEW`, zeigt alle Antworten und Notizen (nur für den Anfragenden) |
| Annehmen (63) | Bestätigung per Modal (optionale Nachricht) → atomarer Statuswechsel → **Pipeline** in Reihenfolge: Personalakte · Dienstnummer · Einstiegsdienstgrad · **Einstiegsrolle** · Team · Probezeit · **Bewerber informieren** · **Leitung informieren**; jeder Schritt einzeln abschaltbar (Dashboard). Schritte ohne Modul (Personalakte, Dienstnummer, Dienstgrad, Team, Probezeit) werden **ehrlich als „nicht verfügbar“ gemeldet** und später von den Modulen per `registerAcceptStep` eingehängt. Audit-Log ist immer an |
| Rollen (83/84) | über `applyRoleChanges`: Regeln der Bewerbung (Wartende entfernen, Annahme-Rolle vergeben), sonst Rolle aus „Rollen & Kanäle“; Protokoll mit vorher/nachher, Auslöser, Automation, Berechtigung, Ergebnis; Fehler (z. B. Bot-Rolle zu niedrig) → Ergebnis „teilweise fehlgeschlagen“, Team wird im Kanal gewarnt, Entscheidung bleibt gespeichert. Test-Bewerbungen ändern keine Rollen |
| Ablehnen (64) | Grund wählen (konfigurierbar, sonst Standardgründe) → optionale Nachricht → Status, Bewerber erfährt den Grund, Audit. **Keine** Personalakte, Dienstnummer oder Einstiegsrolle (nur Rollenregeln „abgelehnt“, z. B. Wartende-Rolle entfernen) |
| Rückfrage / Gespräch | DM an den Bewerber (Status `UNDER_REVIEW`, Notiz, Audit); Antwort des Bewerbers auf eine **offene** Rückfrage geht als Notiz und Kanal-Nachricht ans Team; DM gesperrt → Team erfährt es |
| Zurückziehen (65) | Schaltfläche in der DM nach dem Absenden → Bestätigung per Modal (Grund optional) → `WITHDRAWN` (neuer Status), Team informiert, Nachricht ohne Schaltflächen, Audit; nach einer Entscheidung nicht mehr möglich; danach keine Entscheidung mehr |
| Berechtigungen | je Aktion serverseitig und beim Modal-Absenden **erneut**: Annehmen `applications.submissions.accept`, Ablehnen `…deny`, Rückfrage/Gespräch `…review`, Ansehen/Verlauf `…view`, Notiz `applications.notes.create`; verständliche Meldung („Du benötigst: …“) |
| Dashboard | **Einreichungen** (Liste mit Status/Suche), **Detail** (Antworten, Annehmen/Ablehnen mit Grund, Rückfrage/Gespräch, In Prüfung nehmen, Notizen, Verlauf, Schrittbericht nach der Entscheidung) und **Bewerbung → Bearbeitung** (Schritte schalten, eigene Ablehnungsgründe); neues Auswahlfeld „Bewerbungs-Eingang“ |

## Datenmodell / Statusmaschine
`SubmissionStatus.WITHDRAWN` (Migration `…_submission_withdrawn`); `SUBMITTED/UNDER_REVIEW → ACCEPTED | DENIED | WITHDRAWN`.

## Tests
- `apps/bot` (86): `review.int.test.ts` (**18**, echte DB + Redis, Discord-Attrappe): Eingang/Ping/Schaltflächen/Antworten; Berechtigungen (Annehmen ≠ Ablehnen ≠ Rückfrage, gefälschte Modal-ID, Betrachter, Besitzer); Ansehen, Rückfrage inkl. Antwort des Bewerbers, Gespräch, DM-Sperre; Annahme-Pipeline inkl. ehrlicher „nicht verfügbar“-Schritte, Rollenregeln, abschaltbare Schritte, Rollenfehler 403 → „teilweise“, gesperrte DMs, Test-Bewerbung, gleichzeitige Entscheidung (genau eine gewinnt); Ablehnung (Grund, Nachricht, keine Personal-Schritte, konfigurierte/unbekannte Gründe, nach Entscheidung gesperrt); Zurückziehen (Bestätigung, Team informiert, fremde Nutzer, nach Entscheidung). `bot-events.test.ts` (14 Handler vorhanden).
- `packages/core` (73): neue Übergänge. 
- HTTP-Test (API + DB + Fake-Discord mit DM-/Rollen-Endpunkten): Optionen, Liste, ohne Recht 403, In Prüfung, Rückfrage, Annehmen (Rolle im Fake gesetzt, DM, 5 „nicht verfügbare“ Schritte), zweite Entscheidung 409, gesperrte DM → „teilweise“, Ablehnen, unbekannter Grund, Verlauf. Browser: Einreichungen, Detail, Ablehnen mit Grund.

## Grenzen
- **Nicht gegen echtes Discord getestet** (kein Token).
- Personalakte, Dienstnummer, Einstiegsdienstgrad, Team und Probezeit existieren noch nicht (Phase 11 ff.); ihre Schritte erscheinen bis dahin als „⏳ nicht verfügbar“.
- Wieder-Öffnen einer abgelehnten Bewerbung (`APPLICATION_REOPEN`) ist in der Statusmaschine vorhanden, hat aber noch keine Oberfläche.
- Reviewer-Zuweisung/Threads/Tickets aus dem Schema sind nicht angeschlossen; das Dashboard hat keine Notiz-Eingabe (Notizen per Discord-Schaltfläche).
- Mehrfach-Pipeline-Konfiguration pro Server statt pro Bewerbung ist nicht vorgesehen (je Bewerbung).
