# Phase 19 – Fahndungssystem

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/wanted`, Datenmodell, API, Bot `/fahndung`, Dashboard „Fahndungen“, Tests gegen echte Datenbank. **Bot nur mit Attrappen, Dashboard nicht im Browser getestet, kein echtes Discord.**

## Funktionen
- **Personen und Fahrzeuge getrennt:** eigene Pflichtfelder (Person: Name; Fahrzeug: Kennzeichen), eigene Zusatzfelder (Person: Beschreibung/Merkmale; Fahrzeug: Modell, Farbe, Halter), eigene Anlage-Routen/-Befehle, Reiter im Dashboard. Vermischung der Felder wird abgelehnt.
- **Nummer** `F-0001 …` fortlaufend und atomar je Server (parallel getestet).
- **Keine Doppelfahndung:** dieselbe Person (Name unabhängig von Groß-/Kleinschreibung/Leerzeichen) bzw. dasselbe Kennzeichen (unabhängig von Format) nur einmal gleichzeitig aktiv – die Fehlermeldung nennt die laufende Fahndung; nach dem Aufheben ist eine neue möglich.
- **Bearbeiten** (nur aktive): jede Änderung mit **Vorher/Nachher** und Akteur in der Historie; „nichts geändert“ wird abgelehnt.
- **Aufheben** mit Pflichtgrund (Festnahme, sichergestellt …), nur einmal, Audit-Log + Historie. Aufheben darf, wer `wanted.revoke` hat **oder die Fahndung selbst erstellt hat**.
- **Suchen/Anzeigen:** Freitext über Name, Kennzeichen (formatunabhängig), Modell, Halter, Grund, Nummer (`F-0007`/`7`); Filter Art/Status/Priorität, Blättern; Schnellprüfung `check` (wird X gesucht?).
- **Historie** je Fahndung (angelegt, geändert, aufgehoben).

## Oberflächen & Rechte
Bot: `/fahndung person|fahrzeug|suchen|liste|anzeigen|bearbeiten|aufheben|historie` (Autocomplete der aktiven Nummern). API: `GET/POST /guilds/:id/wanted[/persons|/vehicles]`, `:id`, `check`, `PATCH :id`, `POST :id/revoke`. Rechte: `wanted.view/create/edit` (Beamte), `wanted.revoke` (Leitung).

## Tests
`wanted.test.ts` (6): Nummern parallel, Pflichtfelder/Vermischung, Duplikate, Bearbeiten mit Vorher/Nachher + Umbenennen, Aufheben/Audit/Historie, Suche. Bot `fahndung.int.test.ts` (2): kompletter Ablauf inkl. „eigene Fahndung aufheben“, ohne Recht.

## Grenzen
- Freitext-Suche ist eine einfache Teilstring-Suche (keine Unschärfe/Tippfehlertoleranz); Suche „1“ trifft auch Kennzeichen mit „1“.
- Verknüpfung mit Fahrzeugverwaltung (Phase 20) und Strafen folgt dort; keine automatische Benachrichtigung bei Treffern.
- Bearbeiten/Aufheben im Dashboard ohne Namensauflösung der Ersteller (Discord-IDs).
