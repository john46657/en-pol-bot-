# Wanted

For a person **or** a vehicle (exactly one). Only one ACTIVE record per subject. Clear needs `wanted.clear` + reason; cancel/archive need `wanted.edit`; re-activating an expired record needs `wanted.activate`. Records past `expiresAt` flip to EXPIRED lazily on read/write (no background job needed).

## Automatischer ER:LC-Fahndungsabgleich (*Fahndungen → 🎯 ER:LC-Treffer*, `/wanted/hits`)

Wenn ein Spieler dem konfigurierten ER:LC-Server beitritt, prüft das System, ob er als **aktiv** gesucht geführt wird. Rein informativ: es wird **nie** gekickt, gebannt oder ein Befehl im Spiel ausgeführt.

### Was die ER:LC-API tatsächlich liefert (geprüft gegen https://apidocs.erlc.gg, Stand 10/2026)
- `GET /v2/server?Players=true` → `Players[].Player` im Format **`"Spielername:RobloxUserId"`** (plus Team, Callsign, Permission, WantedStars, Location). Die Roblox-User-ID ist damit verfügbar und der einzige eindeutige Identifikator.
- **Event-Webhooks** gibt es nur für Befehlsnachrichten (`;…`) und Notrufe – **nicht für Beitritte**. Deshalb: kontrolliertes Polling.
- Rate-Limits: Header `X-RateLimit-*`, bei 429 `Retry-After` – das hält der vorhandene ER:LC-Client (`apps/api/src/cad/erlc-client.ts`) bereits ein.

### Ablauf
1. Der Abgleich hängt am vorhandenen Abruf (`ErlcService.poll`) – **keine zusätzlichen API-Anfragen**. Voraussetzung: Funktion „Spieler“ (`players`) für den ER:LC-Server freigegeben.
2. Die Spielerliste wird mit den offenen Sitzungen (`ErlcPlayerSession`) verglichen: neu = Beitritt, fehlt = verlassen. Eine offene Sitzung je Server + Spieler (Teilindex in der DB, auch bei mehreren Instanzen).
3. Nur für **neue** Sitzungen wird gegen aktive, nicht abgelaufene Personen-Fahndungen im Akten-Bereich des ER:LC-Servers abgeglichen:
   - **Roblox-ID der Akte = Roblox-ID aus ER:LC** → Treffer **„Bestätigt“** (`ROBLOX_ID`/`CONFIRMED`).
   - **Nur Name/Alias gleich** (keine ID in der Akte, abweichende ID oder keine ID von der API) → **„Mögliche Übereinstimmung – manuelle Prüfung erforderlich“** (`NAME`/`PENDING`). Nie als eindeutig identifiziert markiert.
4. Je Sitzung und Fahndung höchstens ein Treffer (eindeutiger Index) → bleibt ein Spieler online, gibt es keine Wiederholungen; verlässt er den Server und tritt erneut bei, entsteht genau ein neuer Treffer.
5. Benachrichtigung: Dashboard (alle mit `wanted.view`, Art „ER:LC-Fahndungstreffer“, persönlich ausblendbar) und – über den vorhandenen Bot – Discord. Discord bekommt nur Spielername, Roblox-ID, Fahndungsnummer (`FA-xxxxxxxx`), Grund, Zeitpunkt, Server, Art der Identifikation und einen Dashboard-Link – keine Personalien oder Beschreibung.

### Schutz vor Schein-Identifikation
Die bestehende Aktenübernahme aus ER:LC trägt bei Personen ohne ID die Roblox-ID über den Namen nach. Für Personen **mit aktiver Fahndung** passiert das nicht mehr: die ID kommt erst in die Akte, wenn jemand eine mögliche Übereinstimmung **manuell bestätigt** und „Roblox-ID in die Akte übernehmen“ wählt. Danach werden künftige Beitritte eindeutig erkannt.

### Prüfung, Historie, Status
- Prüfen (`wanted.review_hits`, Begründung Pflicht): mögliche Übereinstimmung bestätigen oder verwerfen; ein ID-Treffer kann verworfen werden (z. B. falsche ID in der Akte). Audit + Verlauf der Fahndung.
- Historie (`WantedHit`) bleibt dauerhaft – auch nach Erledigung/Archivierung der Fahndung oder Entfernen des ER:LC-Servers. Angezeigt werden zusätzlich der **aktuelle** Fahndungsstatus und ob der Spieler noch online ist.
- Discord-Zustellung je Treffer: gesendet / wird gesendet / fehlgeschlagen (nach 5 Fehlversuchen des Bots, mit Fehlertext) / kein Kanal. Ein Fehler beim Senden ändert nichts am Treffer.
- Synchronisierung je ER:LC-Server: Verbindungsstatus, letzte erfolgreiche Synchronisierung, letzter Abgleich, Fehler.
- **API-Ausfall:** kein Abgleich, keine erfundenen Treffer, offene Sitzungen bleiben offen (beim nächsten Erfolg wird normal weiter verglichen); Backoff/Retry-After übernimmt der vorhandene Planer. Folge: Wer während eines Ausfalls geht und wieder kommt, wird nicht erneut gemeldet.

### Einstellungen (`wanted.manage_matching`, je Discord-Server)
Abgleich an/aus · bestätigte Treffer nach Discord · auch mögliche Übereinstimmungen nach Discord (Standard: aus) · eigener interner Kanal (leer = Fahndungs-Kanal aus *Discord-Bot-Channels*). Wird der Abgleich erst eingeschaltet, während ein Gesuchter schon online ist, wird er beim nächsten Beitritt gemeldet.

### API
`GET /api/v1/wanted-hits` (Filter `status`, `matchType`, `wantedId`, `q`) · `GET /wanted-hits/summary` · `GET /wanted-hits/:id` · `POST /wanted-hits/:id/review` `{ decision: VERIFIED|DISMISSED, note, storeRobloxId? }` · `GET|PUT /wanted-hits/settings`.

Nicht enthalten: Fahrzeug-Fahndungen (BOLO) werden nicht automatisch mit gespawnten Kennzeichen abgeglichen.
