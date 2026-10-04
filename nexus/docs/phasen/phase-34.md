# Phase 34 – Performance & Stabilität

**Stand:** abgeschlossen (2026-10-04). Geprüft wurde per Code-Durchsicht **und Messung** (Lasttest gegen echte PostgreSQL mit 100 000 Schichten, 50 000 Audit-Einträgen und 201 Servern; `LOAD=1 pnpm --filter @nexus/api exec vitest run test/load.test.ts`, normal übersprungen). `pnpm -r test` und `typecheck` grün.

## Ergebnisse je Prüfpunkt

| Prüfpunkt | Befund → Maßnahme |
| --- | --- |
| **Datenbankindizes** | Test `performance.test.ts` (neu, 73 Fälle): jede Tabelle mit `guildId` hat einen Index/Unique mit `guildId` an erster Stelle; Kindtabellen (Ereignisse u. ä.) einen Index über die Eltern-ID. **Keine Lücken gefunden.** Neue Tabellen ohne Index lassen den Test scheitern. |
| **Redis Caching** | Redis dient nur Live-System, Rate Limits und Job-Queue. Fachdaten werden bewusst **nicht** gecacht (Rechte müssen sofort wirken; Messwerte unten zeigen, dass es nicht nötig ist). Discord-Daten haben einen Speicher-Cache (Rollen/Server 60 s). |
| **API Performance** (100 000 Schichten, 50 000 Audit) | Schichtliste 36 ms, Folgeseite 42 ms, Statistik 131 ms, Übersicht (4 Zeiträume) 147 ms, Bestenliste 338 ms, Dienstübersicht 5 ms, Audit-Seite ≈ 1 ms, Audit nach Aktion ≈ 1 ms. Statistik und Übersicht luden **alle** Zeilen in den Speicher → jetzt Aggregation in der Datenbank (`fromSums`); die Laufzeit ändert sich kaum (Scan bleibt), der Speicherbedarf nicht mehr linear. |
| **Discord Rate Limits** *(Lücke behoben)* | Vorher: kein Umgang mit `429`. Jetzt: wartet `retry-after` und wiederholt (max. 2×, nur bis 10 s; auch Schreibzugriffe, da 429 = nicht verarbeitet), merkt sich pausierte Bereiche (Methode + Route mit Haupt-ID) und fragt dort nicht weiter, bei langen Sperren sofort ein verständlicher Fehler. |
| **Unnötige Discord-Aufrufe** *(Lücke behoben)* | (1) Gleichzeitige gleiche Lesezugriffe teilen sich **eine** Anfrage (50 parallele → 1, getestet). (2) `getGuildMember` hat optionalen Cache (60 s, auch für „kein Mitglied“). (3) Serverauswahl fragte Mitglieder je Server **nacheinander** und ungecacht bei jedem Aufruf → jetzt parallel und gecacht. |
| **Queue-Verarbeitung** | Benachrichtigungen: Stapel von 100, jede wird vor dem Senden atomar „beansprucht“ (parallele Läufe senden nie doppelt), Wiederholung mit Backoff, Senden nacheinander (schont Rate Limits). Worker-Concurrency 2. Keine Änderung nötig. |
| **WebSocket-Verbindungen** | Pro Benutzer max. 8, Ping/Pong, Rechteprüfung per Intervall, Nachricht max. 1 kB. Neu: **Gesamtgrenze** pro API-Instanz (5000), korrekter Zähler (getestet, auch bei doppeltem Entfernen). |
| **Große Bewerbungen** | Antworten liegen in eigener Tabelle (eindeutig je Frage), Listen sind cursorbasiert, Body-Limit 256 kB. Keine Auffälligkeit; ein Test mit sehr vielen Antworten/Anhängen wurde nicht gemessen. |
| **Viele gleichzeitige Shifts** | 300 parallele Starts in 196 ms, alle erfolgreich; 20 gleichzeitige Starts desselben Benutzers → **genau eine** Schicht (Datenbank-Unique `openKey`). |
| **Viele Server** | 201 Server angelegt: alle Abfragen sind `guildId`-gebunden und indiziert; Server-Liste 1 ms. |

## Bekannte Grenzen
- Gemessen wurde auf einer lokalen Entwicklungs-PostgreSQL (ein Rechner, kein Netzwerk), mit synthetischen Daten. Echte Last mit Netzwerk, Redis und Discord wurde nicht erzeugt; die Zahlen sind Größenordnungen, keine Zusagen.
- Statistik und Bestenliste scannen alle Schichten des Zeitraums (≈ 130–340 ms bei 100 000). Reicht für große Server; bei mehreren Millionen Zeilen wären vorberechnete Zusammenfassungen nötig (Statistik-Snapshots aus Phase 31 sind ein Ansatz).
- Der Discord-Rate-Limit-Schutz arbeitet pro Prozess (API, Bot, Worker getrennt); ein gemeinsamer Zähler über Redis fehlt. Der Cache der API ist ebenfalls pro Instanz.
- Der Rechte-Cache (60 s) heißt: Entzogene Discord-Rollen wirken in der API bis zu 60 s verzögert (Live-Verbindungen werden im Intervall neu bewertet).
