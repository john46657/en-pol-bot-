# Phase 53 – Teamliste (Spezifikation 29) und Abschluss des Funktionsumfangs

**Stand:** abgeschlossen (2026-10-05).

## Neu
- **Teamliste** (`GET personnel/team-overview`, Dashboard „Team“, Bot `/team`): aktive Mitglieder je Team, innerhalb des Teams höchster Dienstgrad zuerst, dann nach Name; Zustand als Ampel (🟢 aktiv, 🟡 Pause, 🔴 außer Dienst, ⚫ suspendiert); Dienstgrad mit Symbol und Farbe. Geschlossene Akten fehlen, leere Teams stehen da, Mitglieder ohne Team unter „Ohne Team“. Rechte wie die Personalliste: wer nur sein Team sehen darf, sieht nur dieses (kein „Ohne Team“). Das Dashboard aktualisiert die Liste jede Minute; `/team [team]` filtert nach Teamname.
- `/akte` zeigt das Dienstgrad-Symbol.

## Funktionsumfang – Stand der Gesamtspezifikation (58 Punkte)
Alle Punkte sind umgesetzt (Phasen 0–53). Bewusste Abweichungen/Grenzen, die bleiben:
- **Fraktionssperre** ist erfassbar, wirkt aber nirgends (keine Fraktions-Beitrittsfunktion im System).
- **Ticket-Formular:** keine Datei-Antworten (Discord-Formulare erlauben keine Uploads); Auswahlfragen sind getippte Antworten.
- **Benachrichtigungen:** nur Glocke im Dashboard (kein Push/DM); bereits gespeicherte Themes haben neue Arten aus, bis sie im Design-Editor aktiviert werden.
- **Design-Modus „Custom“** (Dashboard-Spec Punkt 29) fehlt; Dark/Light sind unabhängig konfigurierbar.
- **Teamliste aus Discord-Rollen:** gruppiert nach den in NEXUS eingerichteten Teams (mit optionaler Discord-Rolle), nicht direkt nach Rollen.
- **Nie gegen einen echten Discord-Bot ausgeführt** – getestet sind Dienste, API, Dashboard und Befehlslogik mit nachgebildeten Eingaben.

## Tests
Personal 34 (Gruppierung, Reihenfolge, geschlossen, leeres Team, Teambeschränkung), API-E2E 199, Bot 148 (`/team`), Browser (`team.spec.ts`): Menüpunkt, Mitglied mit Zustand.
