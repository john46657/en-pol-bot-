# 🤖 Discord-Bot

Der Bot (`apps/bot`, TypeScript, discord.js 14) ist ein **schlanker Client der System-API**. Er hat keine eigene Datenbank und keine eigenen Rechte: jeder Befehl läuft mit den Rechten des **verknüpften Benutzers**.

> **Ehrlich vorab:** Der Bot-Code, die API-Seite (Verknüpfung, Bot-Auth, Outbox) und die Befehlslogik sind automatisiert getestet (Befehle/Outbox mit Fake-API, API-Seite mit Integrationstests, Verknüpfung im Browser-E2E). **Gegen den echten Discord-Dienst wurde er nicht getestet** – dafür fehlen mir Bot-Token und Server. Plane beim ersten Start ein paar Minuten für Rechte/Channel-IDs ein und schick mir die Bot-Logs, falls etwas hakt.

## Befehle
| Befehl | Zweck | Benötigtes Recht (im System) |
|---|---|---|
| `/verknuepfen code` | Discord-Konto mit Benutzer verknüpfen | – |
| `/person suche` | Person nach Roblox-Name/-ID | `persons.view` |
| `/kennzeichen kennzeichen` | Fahrzeug nach Kennzeichen | `vehicles.view` |
| `/fahndungen` | aktive Fahndungen | `wanted.view` |
| `/dienst status` | Dienststatus: an, pause, training, verwaltung, aus | `team.view` |
| `/einheiten` | Einheiten + Status | `dispatch.view` |
| `/einheitstatus rufzeichen status` | Einheitenstatus ändern | `dispatch.edit` |
| `/einsaetze` | offene Einsätze | `incidents.view` |
| `/einsatz titel [prioritaet] [ort]` | Einsatz anlegen | `incidents.create` |
| `/ticket person grund [betrag]` | Ticket ausstellen (Person muss eindeutig sein) | `tickets.create` |
| `/hilfe` | Befehlsübersicht | – |

Alle Antworten sind **nur für den Aufrufer sichtbar** (ephemeral). Fehlt ein Recht, sagt der Bot „Dazu hast du keine Berechtigung“.

## Automatische Benachrichtigungen
Neue/zugewiesene Einsätze (Dispatch-Channel), neue Fahndungen (Wanted-Channel) und Ankündigungen aus dem Kommunikationsmodul (Announcements-Channel). Die API legt sie in eine Outbox; der Bot holt sie alle 5 s ab, postet sie und quittiert. Fällt der Bot aus, bleiben Nachrichten in der Warteschlange und werden nachgeholt (nach 5 Fehlversuchen wird eine Nachricht verworfen und nach 7 Tagen gelöscht). **Ohne konfigurierte Channels wird nichts eingereiht.** Gepostet werden nur Kurzinfos (Nummer, Titel, Priorität, Ort bzw. Fahndungsgrund/-objekt). Pings (`@everyone` etc.) sind immer deaktiviert.

## Einrichtung

### 1. Discord Developer Portal (https://discord.com/developers/applications)
1. *New Application* → *Bot* → **Token** kopieren (nur einmal sichtbar).
2. **Keine** „Privileged Gateway Intents“ nötig (der Bot nutzt nur Slash-Commands).
3. *OAuth2 → URL Generator*: Scopes `bot` **und** `applications.commands`; Bot-Rechte: *View Channels*, *Send Messages*, *Embed Links*. URL öffnen → Bot auf deinen Server einladen.
4. Discord → Einstellungen → Erweitert → **Entwicklermodus** an. Rechtsklick auf deinen Server → *Server-ID kopieren*; Rechtsklick auf die Ziel-Channels → *Channel-ID kopieren*. Der Bot braucht in diesen Channels die Rechte *Kanal ansehen*, *Nachrichten senden*, *Links einbetten*.

### 2. Konfiguration
Gleiches Geheimnis in API **und** Bot (`openssl rand -hex 32`):
```
BOT_API_TOKEN=<64 Hex-Zeichen>      # API + Bot
DISCORD_TOKEN=<Token aus Schritt 1> # nur Bot
DISCORD_GUILD_ID=<Server-ID>        # optional, empfohlen: Commands erscheinen sofort
```
- **Lokal testen:** `DISCORD_TOKEN=… DISCORD_GUILD_ID=… pnpm dev:all` startet den Bot automatisch mit (mit einem festen Entwicklungs-Geheimnis; nur lokal verwenden).
- **Auf dem VPS:** Werte in `.env` eintragen (`BOT_API_TOKEN` erzeugt `setup-server.sh` schon), dann
  ```bash
  docker compose --profile bot up -d --build
  docker compose logs -f bot       # sollte „Logged in as …“ und „… slash commands registered“ zeigen
  ```
- **Channels** im Web: *Admin → Settings → Discord bot channels* (Channel-IDs eintragen, speichern). Leer = diese Benachrichtigung aus.

### 3. Konten verknüpfen
Jede Person: Web → Chat-Symbol oben rechts („Discord verknüpfen“) → *Code erzeugen* → in Discord `/verknuepfen code:ABCD-EFGH` (10 Minuten gültig, einmal verwendbar). Lösen: im selben Dialog, oder ein Admin über `DELETE /api/v1/discord/links/:userId` (Benutzerverwaltung). Deaktivierte Benutzer verlieren sofort den Bot-Zugriff.

## Sicherheitsmodell
- Der Bot authentifiziert sich mit `Authorization: Bot <BOT_API_TOKEN>` (konstante Zeit verglichen). Ohne gesetztes Token ist **jeder** Bot-Zugang in der API deaktiviert.
- Im Namen eines Benutzers (`X-Discord-User`) darf der Bot nur eine **feste Allowlist** an Routen aufrufen (Personen/Fahrzeuge lesen, Fahndungen, Einsätze, Tickets, eigener Dienststatus, Einheiten). Alles andere (Benutzer, Rollen, Audit, Einstellungen, Personal …) liefert `403`, auch für Admins.
- Die normalen Permission-Prüfungen gelten unverändert; Audit-Einträge zeigen den verknüpften Benutzer als Akteur.
- Bot-Dienstrouten (`/bot/*`) akzeptieren **nur** das Bot-Token, nie eine Browser-Session.
- Verknüpfungscodes: 8 Zeichen, nur der Hash wird gespeichert, 10 Minuten, einmalig, Rate-Limit. Ein Discord-Konto ↔ ein Benutzer.
- Falsche Tokens erzeugen `INVALID_TOKEN`-Security-Events.
- Bekannte Grenzen: Wer das `BOT_API_TOKEN` besitzt **und** eine verknüpfte Discord-ID kennt, kann als dieser Benutzer die Allowlist-Routen nutzen – Token wie ein Passwort behandeln (nur in `.env`, Rechte 600). Channel-Inhalte sind für alle sichtbar, die den Channel lesen können.

## Neuen Befehl hinzufügen
1. In `apps/bot/src/commands/index.ts` ein Objekt zu `COMMANDS` hinzufügen (`name`, `description`, `options`, `run`). `run` bekommt `{discordId, opts, api}` und liefert eine `Reply` – nutze `ctx.api.asUser(...)`.
2. Falls der Befehl eine **neue API-Route** braucht: Route in `BOT_USER_ROUTES` in `apps/api/src/authz/guards.ts` freigeben (bewusst, einzeln!).
3. Test in `apps/bot/tests/bot.test.ts` (Fake-API) und ggf. API-Test in `apps/api/test/discord.test.ts`.
4. Bot neu starten – Commands werden beim Start neu registriert.

## Fehlersuche
| Problem | Lösung |
|---|---|
| Bot online, aber keine `/`-Befehle | `applications.commands`-Scope fehlte beim Einladen, oder ohne `DISCORD_GUILD_ID` dauert die globale Registrierung bis zu 1 h. |
| „Dein Discord-Konto ist nicht verknüpft“ | `/verknuepfen` mit frischem Code ausführen. |
| Bot meldet „nicht erreichbar“ | `API_URL` stimmt nicht (im Compose-Netz: `http://api:3000`) oder API ist down. |
| Benachrichtigungen kommen nicht | Channel-ID in *Settings* gesetzt? Bot hat im Channel Schreibrechte? `docker compose logs bot` zeigt `outbox … failed: Missing Access`. |
| Bot startet nicht: `Invalid bot configuration` | `DISCORD_TOKEN` / `BOT_API_TOKEN` (mind. 32 Zeichen, identisch zur API) fehlen. |
