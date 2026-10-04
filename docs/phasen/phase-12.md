# Phase 12 – Shift-System

**Stand:** abgeschlossen (2026-10-04) – Datenmodell, Domänenpaket `@nexus/shifts`, API, Bot-Befehl `/schicht`, Wächter-Job im Worker, Dashboard-Seite, Tests gegen echte Datenbank. **Nicht gegen echtes Discord getestet** (kein Token; Bot-Befehl mit Interaktions-Attrappen, Wächter mit Discord-Port-Attrappe). **Dashboard-Seite nur gebaut und typgeprüft, nicht im Browser durchgeklickt.**

## Modell
| Tabelle | Zweck |
| --- | --- |
| `shift_types` | Shift-Typen (Streife, SEK …) mit optionaler Rollenanforderung und Höchstdauer |
| `shifts` | eine Schicht: Status ACTIVE/PAUSED/ENDED, Beginn/Ende, Pausensumme, Nettodauer, Beendet-von, Grund |
| `shift_events` | Rohdaten: jedes Ereignis (start, pause, resume, end, correct, flag) mit Zeit, Akteur, Daten |

**Eine offene Schicht je Mitglied:** `openKey = 'open'` solange die Schicht läuft (danach NULL) plus Unique-Bedingung – gilt auch bei gleichzeitigen Starts (getestet). Zustandswechsel sind atomar (`updateMany` mit Statusbedingung).

**Abweichung vom Plan:** Die Schicht verweist über `recordId` auf die Personalakte; es wird **kein** zusätzlicher `PersonnelEntry` (kind SHIFT) geschrieben. Grund: `shifts` ist die einzige Quelle der Wahrheit, ein Doppel-Eintrag müsste bei Korrekturen mitgeführt werden und könnte abweichen. Die Akte kann Schichten über `recordId` abfragen; ein Akten-Reiter dafür ist noch offen.

## Funktionen
- **Bot `/schicht start|pause|weiter|ende|status`:** Rechte `shifts.start/pause/end`, `own.shift.view`; Typ per Autocomplete (nur Typen, deren Rollenanforderung erfüllt ist); doppelter Start, Ende ohne Schicht u. Ä. werden verständlich gemeldet.
- **Zeitrechnung:** Netto = Ende − Beginn − Pausen; laufende Pause zählt bis „jetzt“; nie negativ (`time.ts`, getestet).
- **Führung (Dashboard):** fremde Schicht beenden oder vergessenes Ende nachtragen, beendete Schicht korrigieren (Beginn/Ende/Pausen). **Begründung ist Pflicht**, Vorher/Nachher landen im Audit-Log und in den Rohdaten; Plausibilitätsprüfungen (nicht in der Zukunft, Ende nach Beginn).
- **Verlauf, Statistik, Filter** (Status, Typ, Mitglied, Zeitraum), **CSV-Export** der Rohdaten (mit Schutz vor Formelinjektion).
- **Shift-Typen** verwalten (nur serverweite `shifts.manage`); Typen mit Schichten werden deaktiviert statt gelöscht.
- **Wächter (Worker, alle 5 Min):** offene Schichten über der Höchstdauer ihres Typs werden **einmalig** markiert, Hinweis in den Kanal „Schicht-Hinweise“ (neuer Auswahl-Slot `shift-alert-channel`) und per DM an das Mitglied. Es wird **nichts automatisch beendet**. Fehlt der Kanal, steht das im Audit-Log (`failed` mit Grund).

## Rechte
`shifts.view` (Verlauf/Statistik, auch nur Team-Bereich), `shifts.manage` (Typen, Beenden, Korrigieren, Export; Team-Bereich beachtet, Typen nur serverweit), `shifts.start/pause/end` und `own.shift.view` für Beamte (Vorlage erweitert). Die Prüfung erfolgt in API und Bot, nicht nur im Frontend.

## Tests
- `@nexus/shifts`: 23 Tests (Zeitrechnung, Ablauf, paralleler Start, Korrektur, Filter/Team-Bereich, CSV, Wächter).
- Bot `schicht.int.test.ts`: Ablauf, fehlendes Recht, Rollenanforderung.
- Gesamtlauf: alle Pakete grün (Typecheck, Tests).

## Offen / Grenzen
- Kein Test mit echtem Discord; Wächter-Zustellung (Kanal/DM) nur mit Attrappe.
- Dashboard nicht im Browser getestet; keine API-HTTP-Tests für die neuen Routen (Rechte-Logik liegt in bereits getesteten `@nexus/personnel`-Funktionen).
- Akten-Reiter „Schichten“ und Ausbildungs-/Statistik-Auswertungen folgen mit späteren Phasen.
