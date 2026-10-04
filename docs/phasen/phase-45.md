# Phase 45 – Oberfläche für serverweite Überschreibungen

**Stand:** abgeschlossen (2026-10-04). Schließt die in Phase 44 offene Lücke zu Punkt 52 der Dashboard-Spezifikation.

## Neu
- Im Tab **Themes** zeigt der Abschnitt „Serverweite Überschreibungen“ jeden überschriebenen Wert (Pfad und Wert, z. B. `colors.dark.primary`).
- Jeder Eintrag lässt sich einzeln zurücksetzen (`POST design/reset` mit `path`); „Alle Überschreibungen entfernen“ nutzt `PUT design/overrides` mit `null`. Das Theme bleibt dabei unverändert.
- Die Reihenfolge Standard ← Theme ← Überschreibung ist im Text erklärt. Änderungen erscheinen im Änderungsprotokoll.
- Die Übersichts-API lieferte `overrides` bereits; das Dashboard liest sie jetzt.

## Tests
- Browser (`design-extras.spec.ts`): Überschreibungen per API setzen, in der Oberfläche anzeigen, einen Eintrag und danach alle entfernen. 12 Browser-Tests grün.

## Grenzen
- Überschreibungen werden hier nur angezeigt und entfernt, nicht neu angelegt (das geschieht über den Editor bzw. die API).
- Modus „Custom“ (Punkt 29) bleibt offen: Dark und Light sind unabhängig konfigurierbar, ein dritter Modus ist nicht spezifiziert genug.

## Zusatz: Benutzername im Änderungsprotokoll
- `GET design/history` liefert zusätzlich `actorName` (Anzeigename, sonst Benutzername aus der Benutzertabelle). Das Dashboard zeigt den Namen; ist der Benutzer nicht bekannt, bleibt es bei „Benutzer <ID>“.
- Test: API-E2E (Name erscheint, sobald der Benutzer bekannt ist). Der Browser-Test prüft weiter die ID, weil der Test-Besitzer keine Benutzerzeile hat (Rückfall).
