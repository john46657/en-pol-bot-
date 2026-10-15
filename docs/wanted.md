# Wanted

For a person **or** a vehicle (exactly one). Only one ACTIVE record per subject. Clear needs `wanted.clear` + reason; cancel/archive need `wanted.edit`; re-activating an expired record needs `wanted.activate`. Records past `expiresAt` flip to EXPIRED lazily on read/write (no background job needed).

Jede Fahndung hat eine **Fahndungsnummer** (`F-2026-K7M2QX`); ältere Fahndungen bekommen sie per Migration `20261111100000_erlc_wanted_hits`.

## Automatischer ER:LC-Fahndungsabgleich

Menü **Fahndungen → 🎯 Fahndungstreffer (ER:LC)** (`/wanted/hits`), Kurzübersicht über der Fahndungsliste, Treffer auch in der Fahndungsakte.

### Was die ER:LC-API tatsächlich liefert (geprüft an https://apidocs.erlc.gg)
- `GET /v2/server?Players=true`: je Spieler `Player` = `Roblox-Name:Roblox-ID`, dazu Team, Callsign, Berechtigung, Standort, Fahndungssterne. **Weitere eindeutige Kennungen gibt es nicht.**
- `JoinLogs=true`: Beitritte/Austritte mit `Player` (`Name:ID`) und Zeitstempel.
- Event-Webhooks: nur Notrufe und Nachrichten mit `;` – **keine Beitritts-Ereignisse**.

### Ablauf
- Darum **kontrolliertes Polling**: nach jedem erfolgreichen Abruf (Intervall und Rate-Limits wie beim übrigen ER:LC-Abruf, keine Zusatzanfragen) wird die Spielerliste mit der vorherigen verglichen (`ErlcPlayerPresence`). Neu = Beitritt; weg = Aufenthalt beendet. Ist „Join-Logs“ freigegeben, wird auch „kurz raus und wieder rein“ zwischen zwei Abfragen erkannt.
- Abgleich mit allen **aktiven, nicht abgelaufenen Personen-Fahndungen** im Akten-Bereich des Discord-Servers des ER:LC-Servers. Erledigte, abgebrochene, abgelaufene und archivierte Fahndungen treffen nie.
- **Bestätigt** nur bei exakt gleicher Roblox-ID (Personenakte ↔ API). Roblox-Name oder Alias ergeben nur eine **mögliche Übereinstimmung** (Kennzeichnung, manuelle Prüfung); gleicher Name bei abweichender ID wird eigens als „Name gleich, Roblox-ID abweichend“ markiert. Liefert die API keine ID, gibt es nie einen bestätigten Treffer.
- Akten mit aktiver Fahndung bekommen von der automatischen Personen-Übernahme **keine Roblox-ID allein über den Namen** (sonst wäre der nächste „bestätigte“ Treffer geraten). Die ID kommt nur durch manuelle Bestätigung eines Treffers (Häkchen „Roblox-ID in die Personenakte übernehmen“) oder beim Anlegen/Bearbeiten der Akte.
- Je Aufenthalt und Fahndung höchstens **ein Treffer** (Unique-Index) und **eine Discord-Meldung**. Bleibt der Spieler online, passiert nichts weiter; nach Verlassen und erneutem Beitritt gibt es einen neuen Treffer. Aufenthalte werden gespeichert und überstehen Neustarts.
- **Nur Information**: Es wird nie ein Befehl an den ER:LC-Server gesendet (kein Kick, kein Bann, keine Sanktion).

### Prüfung (Recht `wanted.edit`, Ansehen mit `wanted.view`)
- Treffer per Roblox-ID: „Zur Kenntnis genommen“.
- Mögliche Übereinstimmung: „Bestätigen“ oder „Verwerfen“, jeweils mit Begründung. Alles wird im Audit (`wanted.hit.*`) und im Verlauf der Fahndung festgehalten.

### Discord
CAD → Einstellungen → Discord-Kanäle: Ereignisse **„Fahndungstreffer (Roblox-ID bestätigt)“** und **„Mögliche Fahndungsübereinstimmung“** je Kanal. Ohne Zuordnung wird nichts gesendet. Die Meldung enthält nur Spieler, Roblox-ID, Fahndungsnummer, Grund, Priorität, Zeitpunkt, Identifikation und „Im Dashboard öffnen“ – keine Beschreibung, keine Personalien. Fahndungstreffer gehen nie an verbundene Server (Cross-Server). Der Zustellstatus (gesendet / wird wiederholt / fehlgeschlagen / kein Kanal) steht am Treffer.

### Fehler
- ER:LC nicht erreichbar: kein Abgleich, keine erfundenen Treffer; Treffer und Aufenthalte bleiben, Verbindungsstatus und letzte erfolgreiche Synchronisierung werden angezeigt, der Abruf setzt mit Backoff fort. Meldet die API „Server leer/offline“, enden alle Aufenthalte.
- Fehler im Abgleich selbst stehen beim Server („Abgleich fehlgeschlagen“) und im Log; der normale Abruf läuft weiter.

### Daten
`ErlcWantedHit` (dauerhafte Historie: Fahndung + Stand bei Erkennung, Spieler, Roblox-ID, Zeitpunkt, Art der Übereinstimmung, Prüfstatus, Discord-Zustellung), `ErlcPlayerPresence` (aktuelle Aufenthalte). Treffer werden nie automatisch gelöscht; wird ein ER:LC-Server entfernt, bleibt die Historie (Servername gespeichert).
