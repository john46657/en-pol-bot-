# Phase 30 – Dashboard-Live-System

**Stand:** abgeschlossen (2026-10-04) – Paket `@nexus/realtime`, WebSocket-Endpunkt in der API, Veröffentlichung aus API/Bot/Worker, Live-Anbindung im Dashboard. Getestet mit **echtem Redis** und einem **echten WebSocket-Server** (Node `ws`). **Nicht getestet:** kompletter Lauf API-Prozess + Browser (kein Discord-Token, Dashboard nie im Browser geöffnet) – die Verbindung Dashboard-Hook → Server ist nur typgeprüft und gebaut.

## Architektur
1. **Quelle:** Jeder Audit-Eintrag (Phase 29 – alle wichtigen Aktionen aller Module, auch die des Bots) löst über `auditRepository.onLog` ein schlankes Ereignis aus: *Server · Bereich · Aktion · Datensatz-ID · Zeit* – **keine Inhalte**. Alle bisherigen direkten Audit-Schreibvorgänge laufen jetzt über das Repository, damit nichts am Live-System vorbeigeht.
2. **Transport:** Redis Pub/Sub (`nexus:live`), prozessübergreifend. API, Bot und Worker veröffentlichen (best effort: Redis-Ausfall stört keine fachliche Aktion, Beobachter-Fehler auch nicht), die API abonniert.
3. **Auslieferung:** `wss://…/api/v1/live?guildId=…`. Upgrade nur mit **gültiger Session** (Cookie), **erlaubter Origin** (Schutz vor Cross-Site-WebSocket-Hijacking), **Server-Mitgliedschaft** und mindestens einem Recht je Bereich; Ereignisse gehen nur an Clients **mit passendem Recht** (`AREA_PERMISSIONS`), nur desselben Servers. Rechte werden alle 5 Minuten neu bewertet (Verlust → Einschränkung/Trennung), max. 8 Verbindungen je Benutzer, Ping/Pong gegen tote Verbindungen, Nachrichtengröße begrenzt.
4. **Dashboard:** `useLive` verbindet je Server, bündelt Ereignisse (250 ms) und lädt **gezielt nur die betroffenen, aktiven Abfragen** nach (`LIVE_KEYS`: aktive Shifts/Duty, Einsätze, Gefahrenstatus, Tickets, Bewerbungen, SEK, Statistiken, Abmeldungen, Fahndungen, Ausbildung …) – keine Seiten-Neuladung. Anzeige „● Live / ○ offline“ in der Kopfzeile; bei Abbruch Neuverbindung mit Backoff, dazwischen funktionieren die normalen Abfragen weiter.
Die Leitstelle entfällt (Phase 15).

## Datenschutz
Das Ereignis enthält nie Daten. Die eigentlichen Inhalte holt das Dashboard per REST, wo die Berechtigungsprüfung greift – auch wenn jemand ein Ereignis sieht, sieht er keine Daten ohne Recht.

## Tests
`realtime.test.ts` (7, echtes Redis): Veröffentlichen→Abonnieren, keine Inhalte, unbekannte Bereiche ausgefiltert, Redis nicht erreichbar, kaputte Beobachter, Rechte→Bereiche, Verteiler (nur berechtigt, nur Server, Limit, defekte Clients). `live.test.ts` (4, echter HTTP/WS-Server): Ablehnung bei fremder Origin/fehlender oder ungültiger Session/Nicht-Mitglied/ohne Recht, Zulassung mit Bereichen, End-to-End-Zustellung nur berechtigter Ereignisse, Verbindungslimit.

## Grenzen
- Ohne `REDIS_URL` ist Live deaktiviert (Warnung im Log).
- Lokale Dev-Anmeldung per Header funktioniert nicht für WebSockets (nur Cookie-Sitzung).
- Ereignisse sind „etwas hat sich geändert“; es gibt kein Delta-Patching (bewusst einfach, korrekt über REST).
