# Phase 14 – Dienst & Streifen

**Stand:** abgeschlossen (2026-10-04) – Datenmodell, Logik in `@nexus/shifts` (`units.ts`), API, Bot `/streife`, Dashboard „Dienst & Streifen“, Tests gegen echte Datenbank. **Bot nur mit Attrappen, Dashboard nicht im Browser getestet, kein echtes Discord.**

**Anpassung wegen entfallener Leitstelle:** Abnahme lautet „**Die Führung** sieht, welche Einheiten verfügbar oder im Einsatz sind“ (Dashboard und `/streife übersicht`).

## Modell
`units` (Rufname, Art, Status, Fahrzeug, Standort, Notiz; `activeKey` → Rufname je Server nur einmal aktiv), `unit_members` (an eine **laufende Schicht** gebunden; `openKey` → höchstens eine Einheit je Mitglied, auch parallel), `unit_events` (Verlauf).

## Regeln
- **Dienststatus** wird abgeleitet: nicht im Dienst / im Dienst (ohne Einheit) / in Einheit / Pause – kein zweiter Pflegeaufwand.
- Streife bilden und beitreten verlangt eine **laufende, nicht pausierte Schicht**; Ersteller wird Streifenführer; max. 8 Mitglieder.
- **Schicht beenden → Einheit wird automatisch verlassen**; Führung rückt nach; leere Einheit löst sich auf, Rufname wird frei.
- **Besetzung** zählt nur Mitglieder ohne Pause. Ist niemand einsatzbereit, gilt die Einheit als „nicht verfügbar“, unabhängig vom gesetzten Status (Anzeige beider Werte). Status: Verfügbar, Im Einsatz, Pause, Nicht verfügbar – „Im Einsatz“ wird in Phase 17 automatisch durch Einsätze gesetzt, bis dahin manuell.
- Status/Fahrzeug/Standort/Notiz: Mitglieder der Einheit oder Führung. Standort ist optional (Freitext). Fahrzeug ist ein Freitext – die Fahrzeugverwaltung folgt in Phase 20.
- Führung: zuteilen (Mitglied muss im Dienst sein), entfernen, Status ändern, auflösen (Audit-Log).

## Rechte (neu, Bereich „Dienst & Streifen“)
`duty.view`, `duty.unit.join` (Beamte-Vorlage), `duty.unit.manage` (Polizeileitung, Teamleitung). Geprüft in API und Bot.

## Oberflächen
Bot: `/streife bilden|beitreten|verlassen|status|info|übersicht`. API: `GET /guilds/:id/duty`, `PATCH/DELETE units/:id`, `units/:id/assign|remove|history`. Dashboard: Seite mit Zählern, Einheitenliste, „ohne Einheit“, Aktualisierung alle 15 s (Live-Push folgt in Phase 30).

## Tests
`units.test.ts` (7): Bilden/Eindeutigkeit, Beitreten/Verlassen/Führungswechsel/Auflösung, automatisches Verlassen bei Schichtende, Verfügbarkeit mit Pausen, Berechtigung/Verlauf, Zuteilung/Auflösung/Dienststatus, paralleles Bilden. Bot `streife.int.test.ts` (2).

## Grenzen
Kein Namens-Lookup im Dashboard (Discord-IDs); keine Einsatz-Verknüpfung (Phase 17); Streifenführer-Wechsel nur automatisch.
