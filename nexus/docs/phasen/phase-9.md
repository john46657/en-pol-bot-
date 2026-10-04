# Phase 9 – DM-Bewerbung

**Stand:** abgeschlossen (2026-10-04) – DM-Flow ausgebaut und mit einer vollständigen 23-Fragen-Bewerbung gegen **echte Datenbank und echtes Redis** getestet; Discord selbst war durch Attrappen ersetzt (kein Token vorhanden). Ein Lauf gegen echtes Discord steht aus.

## Befund (Fehler im Bestand, behoben)
1. **Der DM-Flow stellte keine einzige Frage:** Die veröffentlichte Version speichert die komplette Konfiguration (`{ questions: [...] }`), die Bot-Funktion `readQuestions` erwartete aber eine Liste und lieferte `[]`. Betraf auch das Review-System. → liest beide Formen, sortiert nach `order`.
2. **Auswahlfragen zeigten keine Optionen** – der Bewerber konnte nicht wissen, was er antworten darf. → nummerierte Optionen + Hinweis je Typ (Datum, Zahlenbereich, Länge …).
3. **„Zurück“ ging zur zuletzt *gespeicherten* (unsortierten) Antwort** statt zur vorherigen Frage.
4. **Optionale Fragen ließen sich nicht überspringen**; Anzeige-Elemente (Info/Absatz) verlangten eine Antwort.
5. **Absenden prüfte keine Pflichtfragen** und räumte nicht mehr sichtbare Antworten nicht auf; Doppel-Klick konnte doppelt einreichen.
6. **Lange Fragen/Zusammenfassungen** (> 2000 Zeichen) hätten das Senden scheitern lassen bzw. Antworten abgeschnitten.
7. **Bearbeiten** führte durch *alle* Folgefragen; Änderungen mit Verzweigung (Bedingungen) ließen veraltete Antworten stehen.
8. **Beliebige DMs** erhielten die Antwort „Bewerbung beendet“ (Spam); eine fertige Bewerbung blockierte eine zweite laufende.
9. **Bot-Neustart** schickte pausierten Bewerbern „wird fortgesetzt“ und stellte die offene Frage nicht erneut.
10. Skip/Leer-Antworten wären an einer nicht nullbaren JSON-Spalte gescheitert (jetzt `JsonNull`).

## Ablauf (Zustände `INTRO → QUESTION → SUMMARY ⇄ EDITING → CONFIRMED | CANCELLED`)
| Schritt | Verhalten |
| --- | --- |
| Starten | Panel-Button → Start-Prüfungen (Status, Cooldown, Rollen, laufende Bewerbungen) → Submission + DM-Zustand → Intro mit „Bewerbung starten“ |
| Frage senden | „Frage n von m“, Text, nummerierte Optionen/Formathinweis, Pflicht/optional; Anzeige-Elemente werden gezeigt und übergangen |
| Antwort speichern | Validierung je Typ (Auswahl auch per Nummer), ungültig → Fehlertext, nichts gespeichert, Frage bleibt offen; Lock gegen gleichzeitige Verarbeitung |
| Nächste Frage | nach Verzweigung (Bedingungen); fehlende Pflichtfragen werden nachgefragt |
| Vorherige Frage | „Zurück“ zur vorherigen *gestellten* Frage; Antworten bleiben erhalten |
| Überspringen | nur optionale Fragen (als leere Antwort gespeichert, nicht erneut gefragt) |
| Pausieren/Fortsetzen | Zustand bleibt gespeichert; in der Pause werden Texte ignoriert (Hinweis); Fortsetzen stellt die offene Frage |
| Abbrechen | beendet die Bewerbung, Schaltflächen werden entfernt, danach ist eine neue möglich |
| Review/Zusammenfassung | alle Antworten (in Nachrichten ≤ 1900 Zeichen geteilt), Menü zum **gezielten** Ändern einer Antwort (kehrt direkt zur Zusammenfassung zurück; neu sichtbare Fragen werden gefragt, nicht mehr sichtbare Antworten verworfen) |
| Absenden | unter Lock: Status prüfen, Pflichtfragen prüfen (sonst Rückfrage), Antworten aufräumen, `SUBMITTED` + Zeit/Dauer + Audit-Ereignis; Doppel-Klick erzeugt keine zweite Einreichung |
| Fortsetzen nach Unterbrechung | Zustand liegt in der Datenbank; nach Bot-Neustart wird der Bewerber informiert und die offene Frage erneut gestellt (pausierte bleiben ruhig) |

Sicherheit: Nur der Bewerber selbst kann seine Schaltflächen nutzen (Besitzer-Prüfung je Aktion); die Antwort-Verarbeitung ignoriert fremde und beendete Bewerbungen.

## Tests
- `apps/bot` (53): 8 Formatierungstests (Limits, Hinweise, 100-Fragen-Zusammenfassung) + **Integrationstest `dm-flow.int.test.ts` (15)** gegen `nexus_test` + Redis (Präfix `nexus-test`): komplette 23-Fragen-Bewerbung inkl. Zusammenfassung und Absenden; Optionsanzeige; ungültige Antworten; Zurück (auch erste Frage); Überspringen (Pflicht/optional); Pause/Fortsetzen und Neustart-Recovery; Abbrechen; fremde Nutzer; gezieltes Bearbeiten (inkl. Verzweigungswechsel); Pflichtprüfung beim Absenden; Doppel-Absenden; Nachrichten vor Start/am Ende; gleichzeitige Nachrichten; Snapshot-Version bleibt maßgeblich.
- `packages/core` (70): Auswahl per Nummer.

## Grenzen
- **Nicht gegen echtes Discord getestet** (kein Token): echte Rate-Limits, DM-Sperren des Nutzers und das Verhalten der Komponenten in echten DMs sind unbestätigt. Ephemere Antworten sind in DMs nicht möglich (Discord zeigt sie als normale Nachricht).
- Zeitlimits/Erinnerungen/Timeout einer Bewerbung (`expiresAt`) folgen mit den Hintergrund-Jobs (Phase 31).
- **Zurückziehen (WITHDRAWN)** und die Benachrichtigung der Bearbeiter (Abschnitte 62/65 der Spezifikation) gehören zur Bearbeitung in Phase 10; der Status `WITHDRAWN` existiert noch nicht.
- „Frage n von m“ kann sich durch Verzweigungen im Verlauf ändern (zählt die aktuell sichtbaren Fragen).
- Dateianhang-Fragen sind noch nicht unterstützt.
