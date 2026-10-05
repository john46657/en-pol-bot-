# Phase 55 – Neues Dashboard (Oberfläche von Grund auf neu gestaltet)

**Stand:** abgeschlossen (2026-10-05). Alle bisherigen Funktionen bleiben erhalten; neu sind Aussehen, Aufbau der Oberfläche und die Startseite.

## Was neu ist
- **Neue Stilbasis** (`apps/dashboard/src/styles/`): Design-Tokens (weiche Flächen, Fokusringe, Abstände, Schatten) werden aus den Farben des Design-Editors **abgeleitet** – jedes Theme des Editors sieht dadurch automatisch stimmig aus. Dateien: `base` (Tokens, Typografie, Eingabefelder, Schaltflächen), `components` (Karten, Listen, Kennzahlen, Plaketten, Hinweise, Dialoge, Toasts), `shell` (Seitenleiste, Kopfzeile, mobile Navigation), `pages` (Übersicht, Anmeldung, Serverauswahl), `legacy-editor` (Design-Editor und Widgets, unverändert und in sich geschlossen). Eingabefelder, Schaltflächen (auch „Löschen/Gefahr“, die bisher keinen Stil hatte), Plaketten und Statusfarben sind einheitlich; Aktionsgruppen in Zeilen haben Abstände; reduzierte Bewegung wird respektiert.
- **Neues Gerüst:** Marke mit Servername, **gruppiertes Menü** (Bewerbungen, Personal, Einsatz, Service, Verwaltung, Darstellung – gilt, solange der Server im Design-Editor keine eigenen Gruppen angelegt hat; eigene Gruppen haben Vorrang), aktiver Punkt mit Markierung, Fußbereich mit „Server wechseln“ und Systemstatus. Kopfzeile mit **Seitentitel** (Server / Seite), Live-Anzeige, Suche (Strg+K), Mitteilungen, Design-Umschalter und Benutzer. Auf dem Handy: Drawer-Menü, zweizeilige Kopfzeile, „Abmelden“ im Menü.
- **Neue Übersicht:** Begrüßung mit Serversymbol, **Schnellzugriff** auf die wichtigsten Seiten (nur, was der Benutzer sehen darf), darunter wie bisher die frei gestaltbaren Widgets.
- **Neue Anmeldeseite** (zweigeteilt, Hinweis zur sicheren Discord-Anmeldung) und **neue Serverauswahl** (Karten mit Symbol, Bot-Status und Aktion).
- **Dunkel/Hell** unabhängig vom Betriebssystem umschaltbar wie zuvor; beide Modi wurden geprüft.

## Geprüft
- **Bildschirmfotos** aller wichtigen Seiten (Anmeldung, Serverauswahl, Übersicht, Bewerbungen, Einreichungen, Team, Personal, Tickets, Fahndungen, Sperren, Ausbildung, Schichten, Panels, Dienstgrade, Berichte, Berechtigungen, Logs, Design-Editor) in Dunkel/Desktop, Hell/Desktop und Dunkel/Handy: `SHOTS=1 pnpm exec playwright test e2e/screenshots.spec.ts` (schreibt nach `test-results/shots`).
- Typecheck, alle Browser-Tests (an das neue Menü angepasst: Team-Menüpunkt jetzt über die Seitenleiste, Menüpunkte mit Leerraum zwischen Symbol und Titel, Begrüßung heißt „Begrüßung“, um nicht mit einem Widget „Willkommen“ zu kollidieren).

## Grenzen
- Die Menü-Symbole sind weiterhin Emojis (im Design-Editor frei änderbar); ihre Darstellung hängt vom Betriebssystem ab.
- Der Design-Editor selbst behält sein bisheriges Layout (nur Schaltflächen/Felder sind neu gestaltet).
- Seiten mit sehr breiten Tabellen oder Listen wurden nicht einzeln neu gesetzt; sie übernehmen die neue Basis.
