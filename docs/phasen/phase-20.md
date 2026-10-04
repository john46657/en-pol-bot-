# Phase 20 – Fahrzeuge & Strafen

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/fleet` (Fuhrpark + Strafen), Datenmodell, API, Bot (`/fahrzeug`, `/strafe`), Dashboard „Fuhrpark“ und „Strafen“, Anbindung an Personalakten. Tests gegen echte Datenbank. **Bot nur mit Attrappen, Dashboard nicht im Browser getestet, kein echtes Discord.**

## Fahrzeuge (Fuhrpark)
- **Kennzeichen** (je Server nur einmal im Bestand, formatunabhängig verglichen), **Typ**, **Status** (verfügbar / im Dienst / Werkstatt / außer Dienst), **Einheit**, **Fahrer**, **Schäden**.
- **Einheit + Fahrer:** Zuweisen setzt „im Dienst“ und schreibt das Fahrzeug in die Einheit (Phase 14); Fahrer muss Mitglied der Einheit sein; eine Einheit fährt nur ein Fahrzeug; nicht einsatzbereite Fahrzeuge (Werkstatt/außer Dienst) lassen sich nicht zuweisen. Wird eine Einheit aufgelöst, wird das Fahrzeug beim nächsten Lesen automatisch freigegeben (Verlauf-Eintrag).
- **Schäden:** leicht (nur Vermerk), schwer (→ Werkstatt), Totalschaden (→ außer Dienst); „repariert“ je Schaden; sind alle behoben, geht ein Werkstatt-Fahrzeug zurück auf „verfügbar“.
- Ausmustern (Audit-Log, Kennzeichen wird wieder frei), Verlauf je Fahrzeug, Suche/Filter.
- **Personalakte:** Fahrer sind über die Benutzer-ID verknüpft (`vehiclesOfDriver`).

## Strafen
- Arten: **Bußgeld** (Betrag 1–10 Mio.), **Verwarnung**, **Strafpunkte** (1–20), **Führerscheinentzug** (1–3650 Tage, Ende wird berechnet), **Fahrzeugbeschlagnahmung** (Kennzeichen Pflicht). Pflichtangaben je Art werden geprüft, fremde Angaben abgelehnt; Nummer `S-0001` fortlaufend und atomar.
- **Mit Personalakten verbunden:** Für den **Aussteller** entsteht ein Eintrag „PENALTY“ (Nummer, Art, Betrag/Punkte/Dauer, Person, Grund) in dessen Akte; Aufheben (Grund Pflicht, Audit-Log) **widerruft** den Eintrag. Ohne Akte entsteht kein Eintrag und kein Fehler. Die Akte zeigt „Einsätze & Strafen“.
- **Strafenregister je Person** (Name schreibweisenunabhängig): aktive Bußgeldsumme, Verwarnungen, Strafpunkte (Hinweis bei ≥ 8), laufender Führerscheinentzug, beschlagnahmte Kennzeichen; aufgehobene Strafen zählen nicht, ein abgelaufener Entzug auch nicht.
- Suchen (Name, Nummer, Kennzeichen, Grund; Filter Art/Aussteller/Status).

## Rechte
`fleet.view`/`fleet.report` (Beamte), `fleet.manage` (Leitung); `penalties.view`/`penalties.issue` (Beamte), `penalties.revoke` (Leitung; Aussteller dürfen eigene Strafen aufheben).

## Tests
`fleet.test.ts` (10): Kennzeichen, Einheit/Fahrer, aufgelöste Einheit, Schäden/Reparatur, Status/Ausmustern, alle fünf Strafarten (parallel nummeriert), Validierung, Personalakten-Eintrag + Widerruf, Register, Suche. Bot `fleet.int.test.ts` (3).

## Grenzen
- Strafen richten sich gegen Personen **per Name** (optional Discord-ID), nicht gegen Personalakten von Zivilisten – diese gibt es nicht.
- Die Punktegrenze (8) ist ein Hinweis, kein automatischer Führerscheinentzug. Beschlagnahmung ändert keinen Fahrzeugbestand (beschlagnahmte Fahrzeuge sind Zivilfahrzeuge).
- Kein Abgleich Strafen ↔ Fahndungen/Einsätze (nur optionale Einsatznummer im Datensatz).
