# Phase 28 – Büro-Warteraum

**Stand:** abgeschlossen (2026-10-04) – Auswahl (seit Phase 5 im Dashboard), Statusprüfung `@nexus/office`, API, Bot `/buero`, Dashboard-Statusanzeige. Tests gegen echte Datenbank. **Bot nur mit Attrappen, Dashboard nicht im Browser getestet, kein echtes Discord.**

## Umsetzung gemäß Plan
- Der Administrator wählt **einen vorhandenen Sprachkanal** (z. B. „🔊 Büro-Warteraum“) unter *Rollen & Kanäle wählen* (Slot `office-waiting-voice`, aus Discord geladen, serverseitig validiert, Änderungen im Audit-Log) – es werden keine IDs getippt.
- Der Bot behandelt den Kanal **lediglich als konfigurierten Büro-Warteraum**: Er legt nichts an, **verschiebt, stummschaltet und trennt niemanden**. Vorhanden sind nur lesende Funktionen: `getWaitingRoom` (Status) und `isWaitingRoom`.
- **Statusprüfung** mit klarer Meldung: nicht festgelegt · Kanal existiert nicht mehr · kein Sprachkanal · **Konflikt mit Funk**. Anzeige im Dashboard über der Auswahl, im Bot per `/buero status`; `/buero wartend` listet, wer sich gerade im Kanal aufhält (Recht `personnel.view`).
- **Schutz vor Konflikt mit Phase 16:** Der Warteraum kann nicht als Funkkanal eingerichtet werden (sonst würde die Funk-Durchsetzung Besucher trennen); ein nachträglich entstandener Konflikt wird im Status benannt.

## Tests
`office.test.ts` (4): nicht konfiguriert, gültiger Sprachkanal, Textkanal/gelöschter Kanal/Funk-Konflikt, Änderung/Entfernen der Auswahl. `radio.test.ts` (+1): Warteraum nicht als Funkkanal. Bot `buero.int.test.ts` (2).

## Grenzen
- Die Auswahl selbst ist in der API ein Slot-Feld; der Funk-Konflikt wird dort nicht beim Speichern abgelehnt (die Auswahl-Tests mocken die Datenbank), sondern im Status angezeigt und beim Einrichten von Funk verhindert.
- Keine Benachrichtigung, wenn jemand den Warteraum betritt (bewusst nicht Teil der Phase).
