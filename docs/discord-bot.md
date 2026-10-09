# 🤖 Discord-Bot

Der Bot (`apps/bot`, TypeScript, discord.js 14) ist ein **schlanker Client der System-API**. Er hat keine eigene Datenbank und keine eigenen Rechte: jeder Befehl läuft mit den Rechten des **verknüpften Benutzers**.

> **Ehrlich vorab:** Der Bot-Code, die API-Seite (Verknüpfung, Bot-Auth, Outbox) und die Befehlslogik sind automatisiert getestet (Befehle/Outbox mit Fake-API, API-Seite mit Integrationstests, Verknüpfung im Browser-E2E). **Gegen den echten Discord-Dienst wurde er nicht getestet** – dafür fehlen mir Bot-Token und Server. Plane beim ersten Start ein paar Minuten für Rechte/Channel-IDs ein und schick mir die Bot-Logs, falls etwas hakt.

## Befehle
| Befehl | Zweck | Benötigtes Recht (im System) |
|---|---|---|
| `/entverknuepfen` | Verknüpfung lösen | – |
| `/profil` | eigenes Konto, Rollen, Anzahl Berechtigungen | – |
| `/hilfe` | Befehlsübersicht | – |
| `/person suche` | Person nach Roblox-Name/-ID | `persons.view` |
| `/kennzeichen kennzeichen` | Fahrzeug nach Kennzeichen | `vehicles.view` |
| `/fahndungen` | aktive Fahndungen | `wanted.view` |
| `/einsaetze` | offene Einsätze | `incidents.view` |
| `/einsatzinfo nummer` | Details, Einheiten, Verlauf eines Einsatzes | `incidents.view` |
| `/einheiten` | Einheiten + Status | `dispatch.view` |
| `/team` | wer ist im Dienst (Einheit, Einsatz) | `team.view` |
| `/abmeldung von bis grund` | Abmeldung (Urlaub, Abwesenheit) beantragen, z. B. `von: 24.12.` `bis: 02.01.2027` (auch `heute`, `morgen 18:00`); die Leitung entscheidet per Button | `leave.request` |
| `/dienststunden [tage] [alle]` | eigene Dienststunden der letzten 7 (1–90) Tage nach Status; mit `alle` die Stunden aller Beamten | `team.view` · `alle`: `team.manage` |
| `/dienstpanel` | postet das Dienst-Panel: Buttons **Im Dienst / Pause / Außer Dienst** (setzt den Status als verknüpfter Benutzer) | Discord „Server verwalten“; Klick: `team.view` |
| `/qualipanel` | postet das Qualifikations-Panel (SEK, Flugstaffel, Ausbilder …): Auswahl → Fragen einzeln per DM → Bewerbung mit Annehmen/Ablehnen-Buttons im Team-Channel ([qualifications.md](qualifications.md)) | Discord „Server verwalten“; entscheiden: `qualifications.decide` |
| `/dienst status` | eigener Dienststatus: an, pause, aus | `team.view` |
| `/einheitstatus rufzeichen status` | Einheitenstatus ändern | `dispatch.edit` |
| `/einsatz titel [prioritaet] [ort]` | Einsatz anlegen | `incidents.create` |
| `/einsatzstatus nummer status` | Status: bestaetigt, unterwegs, vor_ort, in_bearbeitung, abschluss, abgebrochen, geschlossen | `dispatch.edit` (`geschlossen`: `dispatch.close`) |
| `/einsatzzuweisen nummer rufzeichen` | Einheit einem Einsatz zuweisen | `dispatch.assign` |
| `/funk kanal text` | Nachricht in Systemkanal team/dispatch | `communication.send` |
| `/bericht titel text [typ] [einreichen]` | Bericht als Entwurf oder direkt einreichen | `reports.create` (+ `reports.submit`) |
| `/beschwerde kategorie beschreibung [person]` | Beschwerde erfassen | `complaints.create` |
| `/ermittlung titel [beschreibung]` | Ermittlungsfall eröffnen | `investigations.create` |
| `/fahndung person grund [prioritaet]` | Person zur Fahndung ausschreiben | `wanted.create` |
| `/beweis typ beschreibung [fall]` | Beweisstück erfassen | `evidence.create` |
| `/benachrichtigungen` | ungelesene Benachrichtigungen | – |
| `/bewerbung` | Bewerbung bei EN Polizei – Fragen einzeln per **Direktnachricht** (auch **ohne** Verknüpfung); Entscheidung kommt per DM | – |
| `/bewerbungspanel` | postet das Bewerbungs-Panel mit Button „Jetzt bewerben“ (startet denselben DM-Ablauf) | Discord „Server verwalten“ |
| `/gefahrenstatus [aktion] [stufe] [grund]` | Gefahrenstatus anzeigen / setzen (grün, gelb, rot) / als Button-Panel in den Channel posten | anzeigen: `dashboard.view` · setzen: `dispatch.manage` · Panel: Discord „Server verwalten“ |
| `/teamliste` | selbst aktualisierende Teamliste einrichten bzw. sofort aktualisieren | `team.view` + Discord „Server verwalten“ |
| `/funkfreigabe aktion [mitglied]` | Funk-Whitelist: hinzufuegen, entfernen, pruefen, liste (vergibt/entzieht optional die Funkrolle) | prüfen/liste: `team.view` · ändern: `personnel.edit` |
| `/support [mitglied]` | Support-Ticket öffnen (Auswahl der Ticket-Art); mit `mitglied` öffnet das Team ein Ticket für jemand anderen | öffnen: jeder (Voraussetzungen der Ticket-Art) · für andere: `ticket.create` |
| `/roblox name` | Roblox-Benutzer suchen (Name → ID, Profil-Link) | – |

Bewusst **nicht** über Discord möglich: Berichte freigeben/ablehnen, Fahndungen aufheben, Beschwerden bearbeiten, Personal-, Benutzer-, Rollen- und Audit-Funktionen. Das bleibt im Web.

Alle Antworten sind **nur für den Aufrufer sichtbar** (ephemeral). Fehlt ein Recht, sagt der Bot „Dazu hast du keine Berechtigung“.

## Panels, Teamliste und Support-Tickets
- **Gefahrenstatus-Panel** (`/gefahrenstatus aktion:panel hier posten`): Embed mit Buttons Grün/Gelb/Rot. Wer klickt, ändert den Status **mit seinen eigenen Rechten** (verknüpft + `dispatch.manage`). Das Panel zieht sich selbst nach – auch wenn der Status per Befehl geändert wird. Es gibt immer nur ein aktives Panel; wird es in einen anderen Kanal gesetzt, löscht der Bot das alte. **Auch aus dem Dashboard:** Discord-Nachrichten → Gefahrenstatus → „Panel in Discord senden“ – Kanal wählen, „Panel senden“ (Recht `settings.manage`, wird protokolliert).
- **Teamliste** (`/teamliste`): steht im Channel aus *Settings → Team list channel ID* (sonst im aktuellen Channel), gruppiert nach Rang (Reihenfolge: *Settings → Team list rank order*), mit Dienststatus. Abgleich alle `LIVE_REFRESH_SECONDS` (Standard 5 s); bearbeitet wird nur bei Änderungen. Gelöschte Nachricht → wird neu gepostet.
- **Support-Tickets**: komplett im Dashboard eingerichtet (*Operations → Support Tickets*): Panels werden von dort gesendet/aktualisiert – kein Slash-Command nötig. Kategorien, Fragen, Buttons, Rollen, Texte, Status, Prioritäten, Transcripts, Bewertungen, Automatik: [support-tickets.md](support-tickets.md).
- **Funk-Freigabe**: maßgeblich ist die Liste im System; ist *Radio role ID* gesetzt, vergibt/entzieht der Bot zusätzlich diese Discord-Rolle (Bot-Rolle muss **über** der Funkrolle stehen).
- **Bewerbung** (wie bei Appy): `/bewerbung` oder Button „Jetzt bewerben“ (`/bewerbungspanel`) → Direktnachricht „Bist du sicher …?“ mit *Bewerbung starten*/*Abbrechen* → der Bot fragt den Roblox-Namen und danach **jede Frage des Bewerbungsformulars einzeln** (bearbeiten unter *Qualifications → Setup*) (optionale Fragen mit „-“ überspringen; 3 Stunden Zeit). Die Roblox-ID wird über die Roblox-API ergänzt; eine offene Bewerbung pro Discord-Konto. Die Bewerbung erscheint wie bei Appy im **Applications channel** (Fragen fett + Antworten, Bewerber-Infos, Buttons Annehmen/Ablehnen – auch mit Grund –, Verlauf, Ticket, Dashboard). Bei Annahme/Ablehnung bekommt die Person eine **DM** (mit Grund nur, wenn „… mit Grund“ benutzt wurde; der interne Grund aus dem Web bleibt intern). Qualifikationen (SEK, Flugstaffel, Ausbilder) laufen genauso über `/qualipanel` ([qualifications.md](qualifications.md)).
- **Bewerbungssperren** (Dashboard → Bewerbungen → ⛔ Sperren, Recht `applications.decide`): Person per Discord-ID und/oder Roblox-Name/-ID für alle Bewerbungen, die Polizei-Bewerbung oder einzelne Qualifikationen sperren – mit Grund und optionalem Ablaufdatum. **Jeder Discord-Server hat seine eigene Sperrliste** (oben links gewählter Server; ohne Server = gilt überall). Gesperrte bekommen schon beim Klick auf „Bewerben“ bzw. bei `/bewerbung` den Grund angezeigt; das Absenden wird zusätzlich serverseitig abgewiesen (auch über die Bewerbungsseite, per Roblox-ID).

## Automatische Benachrichtigungen
Neue/zugewiesene Einsätze (Dispatch-Channel), neue Fahndungen (Wanted-Channel), Ankündigungen aus dem Kommunikationsmodul (Announcements-Channel), neue Bewerbungen (Applications-Channel) und Änderungen des Gefahrenstatus (Danger-Channel). Die API legt sie in eine Outbox; der Bot holt sie alle 5 s ab, postet sie und quittiert. Fällt der Bot aus, bleiben Nachrichten in der Warteschlange und werden nachgeholt (nach 5 Fehlversuchen wird eine Nachricht verworfen und nach 7 Tagen gelöscht). **Ohne konfigurierte Channels wird nichts eingereiht.** Gepostet werden nur Kurzinfos (Nummer, Titel, Priorität, Ort bzw. Fahndungsgrund/-objekt). Pings (`@everyone` etc.) sind immer deaktiviert. **Gefahrenstatus-Meldungen ersetzen sich:** Wird ein neuer Status gemeldet, löscht der Bot die vorherige Meldung im selben Kanal (der Bot braucht dort „Nachrichten verwalten“ nur, wenn die alte Nachricht nicht von ihm selbst stammt – eigene darf er immer löschen). Die zuletzt gesendete Nachricht merkt sich die API, das klappt also auch nach einem Neustart des Bots.

## Einrichtung

### 1. Discord Developer Portal (https://discord.com/developers/applications)
1. *New Application* → *Bot* → **Token** kopieren (nur einmal sichtbar).
2. Unter *Bot → Privileged Gateway Intents* einschalten: **Message Content** (Verlauf/Transcript der Support-Tickets), **Server Members** (vollständige Teamliste im Dashboard) und **Presence** (Online-Status in der Teamliste). Fehlt eines, startet der Bot trotzdem ohne – siehe [dashboard.md](dashboard.md).
3. *OAuth2 → URL Generator*: Scopes `bot` **und** `applications.commands`; Bot-Rechte: *View Channels*, *Send Messages*, *Embed Links* *Attach Files*, *Read Message History* – für Support-Tickets zusätzlich *Manage Channels* und *Manage Roles* (Kanalrechte), für Rollen bei Bewerbungen/Funk *Manage Roles*, für Staff-Threads bei Bewerbungen *Create Public Threads*. Der Bot meldet dem Dashboard automatisch seine Server mit Channels und Rollen (für die Auswahllisten). URL öffnen → Bot auf deinen Server einladen.
4. Discord → Einstellungen → Erweitert → **Entwicklermodus** an. Rechtsklick auf deinen Server → *Server-ID kopieren*; Rechtsklick auf die Ziel-Channels → *Channel-ID kopieren*. Der Bot braucht in diesen Channels die Rechte *Kanal ansehen*, *Nachrichten senden*, *Links einbetten*.

**Bot einladen (einfachster Weg):** Dashboard → *Administration → Settings* → **Add bot to a server**. Der Button gibt dem Bot Administrator-Rechte und läuft über das Dashboard. Dadurch funktioniert er auch, wenn im Developer Portal **„OAuth2-Code-Erlaubnis benötigt“** an ist; das System löst den Code selbst ein. Danach landest du wieder in den Einstellungen. Er steht auch in der Konsole, sobald der Bot startet („Bot einladen: …“).

Klappt das Einladen nicht, im Developer Portal unter **Bot** prüfen:
- **Public Bot** an: sonst kann nur das Konto einladen, dem der Bot gehört.
- **Requires OAuth2 Code Grant** aus: sonst meldet Discord einen Fehler.

Außerdem brauchst du auf dem Server das Recht **Server verwalten**. Im *OAuth2 URL-Generator* beim Einladen **keine Weiterleitungs-URI** auswählen; die ist nur für den Login.

### 2. Konfiguration
Gleiches Geheimnis in API **und** Bot (`openssl rand -hex 32`):
```
BOT_API_TOKEN=<64 Hex-Zeichen>      # API + Bot
DISCORD_TOKEN=<Token aus Schritt 1> # nur Bot
DISCORD_GUILD_ID=<Server-ID>        # optional – Commands kommen automatisch auf jeden Server des Bots
```
- **Lokal testen:** `DISCORD_TOKEN=… DISCORD_GUILD_ID=… pnpm dev:all` startet den Bot automatisch mit (mit einem festen Entwicklungs-Geheimnis; nur lokal verwenden).
- **Auf dem VPS:** Werte in `.env` eintragen (`BOT_API_TOKEN` erzeugt `setup-server.sh` schon), dann
  ```bash
  docker compose --profile bot up -d --build
  docker compose logs -f bot       # sollte „Logged in as …“ und „… slash commands registered“ zeigen
  ```
- **Channels** im Web: *Admin → Settings → Discord bot channels* (Channel-IDs eintragen, speichern). Leer = diese Benachrichtigung aus.

### 3. Konten verknüpfen
Jede Person: Web → Chat-Symbol oben rechts („Discord verknüpfen“) → *Mit Discord verknüpfen* (Discord-Anmeldung; braucht `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`). Wer sich mit Discord anmeldet, ist automatisch verknüpft. Lösen: im selben Dialog, oder ein Admin über `DELETE /api/v1/discord/links/:userId` (Benutzerverwaltung). Deaktivierte Benutzer verlieren sofort den Bot-Zugriff.

## Mehrere Discord-Server
- **Befehle:** Der Bot registriert die Slash-Commands **automatisch auf jedem Server, auf dem er ist** – beim Start und sofort, wenn er auf einen neuen Server eingeladen wird. `DISCORD_GUILD_ID` ist dafür nicht mehr nötig (optional zusätzlich). Schlägt ein Server fehl, steht das im Log, die anderen laufen weiter.
- **Server-Auswahl im Dashboard (oben links bei „EN Polizei“):** Sobald der Bot auf mindestens 2 Servern ist, erscheint ein Dropdown. *All servers* = gemeinsame Einstellungen und alles sehen; ein Server gewählt = nur dessen Bewerbungen/Tickets, und Einstellungen gelten nur für diesen Server.
  - **Pro Server** (ohne eigene Einstellungen gelten die gemeinsamen): Polizei-Bewerbung und Qualifikationen (Texte, Fragen, Channels, Rollen), Ticket-Panels und Ticket-Arten, die Bewerbungen und Tickets selbst. „Use shared settings again“ entfernt die eigenen Einstellungen eines Servers.
  - **Gemeinsam:** MDT, Personen, Berichte, Team, Benutzer und Rechte, Ticket-Status/Prioritäten/Gründe.
  - Channel- und Rollen-Auswahl zeigen nur den gewählten Server.
- **Benachrichtigungen:** Unter *Admin → Settings → Discord bot channels* pro Art (Dispatch/Wanted/Announcements) mehrere Channel-IDs mit Komma eintragen, auch auf verschiedenen Servern. Gesendet wird an alle; die Nachricht gilt als zugestellt, sobald mindestens ein Channel erreicht wurde.
- Die Verknüpfung (Discord-Konto ↔ Benutzer) ist serverübergreifend: ein Konto, alle Server.

## Sicherheitsmodell
- Der Bot authentifiziert sich mit `Authorization: Bot <BOT_API_TOKEN>` (konstante Zeit verglichen). Ohne gesetztes Token ist **jeder** Bot-Zugang in der API deaktiviert.
- Im Namen eines Benutzers (`X-Discord-User`) darf der Bot nur eine **feste Allowlist** an Routen aufrufen (`BOT_USER_ROUTES` in `apps/api/src/authz/guards.ts`: lesen von Personen/Fahrzeugen/Fahndungen/Einsätzen/Team, Anlegen von Einsätzen/Tickets/Berichten/Beschwerden/Ermittlungen/Fahndungen/Beweisen, Einsatzsteuerung, eigener Dienststatus/Profil). Alles andere (Benutzer, Rollen, Audit, Einstellungen, Personal …) liefert `403`, auch für Admins.
- Die normalen Permission-Prüfungen gelten unverändert; Audit-Einträge zeigen den verknüpften Benutzer als Akteur.
- Bot-Dienstrouten (`/bot/*`) akzeptieren **nur** das Bot-Token, nie eine Browser-Session.
- Verknüpfungscodes: 8 Zeichen, nur der Hash wird gespeichert, 10 Minuten, einmalig, Rate-Limit. Ein Discord-Konto ↔ ein Benutzer.
- Falsche Tokens erzeugen `INVALID_TOKEN`-Security-Events.
- Bekannte Grenzen: Wer das `BOT_API_TOKEN` besitzt **und** eine verknüpfte Discord-ID kennt, kann als dieser Benutzer die Allowlist-Routen nutzen – Token wie ein Passwort behandeln (nur in `.env`, Rechte 600). Channel-Inhalte sind für alle sichtbar, die den Channel lesen können.

## Bot allein hosten (eigenständiges Paket)
`pnpm bundle:bot` erzeugt `dist-bot/en-polizei-bot.zip`: eine einzige lauffähige **`bot.js`** (alles inklusive, **kein `npm install`**) plus Quellcode. Startbefehl `node bot.js`; Variablen `DISCORD_TOKEN`, `BOT_API_TOKEN`, `API_URL` (+ optional `DISCORD_GUILD_ID`). Sinnvoll, wenn das System (API + Web) woanders läuft. Im kompletten Hosting-Paket ([hosting-bot-hosting.md](hosting-bot-hosting.md)) ist der Bot bereits enthalten.

## Neuen Befehl hinzufügen
1. In `apps/bot/src/commands/index.ts` ein Objekt zu `COMMANDS` hinzufügen (`name`, `description`, `options`, `run`). `run` bekommt `{discordId, opts, api}` und liefert eine `Reply` – nutze `ctx.api.asUser(...)`.
2. Falls der Befehl eine **neue API-Route** braucht: Route in `BOT_USER_ROUTES` in `apps/api/src/authz/guards.ts` freigeben (bewusst, einzeln!).
3. Test in `apps/bot/tests/bot.test.ts` (Fake-API) und ggf. API-Test in `apps/api/test/discord.test.ts`.
4. Bot neu starten – Commands werden beim Start neu registriert.

## Fehlersuche
| Problem | Lösung |
|---|---|
| Bot online, aber keine `/`-Befehle | `applications.commands`-Scope fehlte beim Einladen, oder der Bot hat nach dem Einladen noch nicht neu gestartet (die Befehle kommen sonst sofort beim Beitritt). |
| „Dein Discord-Konto ist nicht verknüpft“ | Im Dashboard „Mit Discord verknüpfen“ wählen (Chat-Symbol oben rechts). |
| Bot meldet „nicht erreichbar“ | `API_URL` stimmt nicht (im Compose-Netz: `http://api:3000`) oder API ist down. |
| Benachrichtigungen kommen nicht | Channel-ID in *Settings* gesetzt? Bot hat im Channel Schreibrechte? `docker compose logs bot` zeigt `outbox … failed: Missing Access`. |
| Bot startet nicht: `Invalid bot configuration` | `DISCORD_TOKEN` / `BOT_API_TOKEN` (mind. 32 Zeichen, identisch zur API) fehlen. |

## Dienststatus ↔ Discord (Synchronisierung)
Jeder Statuswechsel – egal ob im **Dashboard**, per **`/dienst`**, per **Dienst-Panel** oder durch die **Schichtleitung** – wird an Discord weitergegeben:
- **Dienst-Rollen** (*Settings → Discord*: *On-duty role ID*, optional *Break / Training / Administrative role ID*): Im Dienst → Rolle vergeben, sonst entfernt; immer nur die Rolle des aktuellen Status. Gilt auf allen Servern, auf denen es die Rolle gibt. Voraussetzung: verknüpftes Konto (Dashboard → „Mit Discord verknüpfen“), Bot-Rolle steht über den Dienst-Rollen und hat „Rollen verwalten“.
- **Dienst-Channel** (*Duty channel ID*): Meldung wie „🟢 A-11 · Oscar ist jetzt im Dienst“ bzw. „⚪ … außer Dienst – Vorher: im Dienst – 2 h 15 min“ (bei Schichtleitung: „Gesetzt von …“).
- **Teamliste** (`/teamliste`) wird sofort neu gezeichnet.

**Schichten-Modul** (*Administration → Shifts*, wie bei Melonly/ERM): Ist es an, gelten statt der Dienst-Rollen oben die **Schicht-Arten**: je Art eine *On Shift Role* (im Dienst), eine *On Break Role* (Pause) und ein *Shift Log Channel* (sonst der Dienst-Channel). Bei mehreren Arten fragt der Bot nach „Im Dienst“ (Panel-Button oder `/dienst`) per Auswahlmenü, welche Schicht beginnt; im Dashboard wählt man sie auf der Team-Seite. Ohne Auswahl gilt die **Default**-Schicht. Außer Dienst entfernt alle Schicht-Rollen.

Ist weder Channel noch Rolle eingestellt, wird nichts eingereiht. Fällt der Bot kurz aus, werden die Änderungen nachgeholt.

## Embeds (Baukasten wie bei Sapphire)
*Administration → Embeds* (ansehen `settings.view`, bearbeiten/senden `settings.manage`): Nachricht mit Embed bauen – Text über dem Embed, Titel, Beschreibung, Farbe, **Abschnitte** (Überschrift mit Emoji + Text, z. B. „👑 | Kommandant:“, bis 25; „Aus Dienstgraden“ legt je Dienstgrad der Teamstruktur einen Abschnitt an), Autor, Bilder, Link, Fußzeile, Zeitstempel – mit Live-Vorschau.
- **Senden** in den gewählten Kanal (z. B. `#karriereweg`). Danach **Nachricht aktualisieren**: der Bot bearbeitet dieselbe Nachricht (kein neuer Post); **Neu senden** postet eine weitere. Wurde die Nachricht in Discord gelöscht, postet der Bot sie neu.
- Discord-Grenzen werden geprüft (6000 Zeichen je Embed, 1024 je Abschnitt).

## Willkommen & Abschied
*Administration → Willkommen & Abschied* (je Server – oben links wählen; „Alle Server“ = gemeinsame Grundeinstellung):
- **Willkommensnachricht** in einem Kanal (Titel, Text, Farbe, Profilbild, Erwähnung des neuen Mitglieds, **Banner**) mit Vorschau. Banner: Bild hochladen (PNG/JPG/GIF/WebP bis 8 MB – der Bot hängt es an die Nachricht an) oder eine Bild-URL (https://). Die Abschiedsnachricht kann ebenfalls einen Banner haben.
- **Willkommens-DM** und **automatische Rollen** für neue Mitglieder (keine Bots; die Bot-Rolle muss über diesen Rollen stehen).
- **Abschiedsnachricht**, wenn jemand den Server verlässt.
- Platzhalter: `{user}`, `{username}`, `{displayName}`, `{server}`, `{memberCount}`, `{accountAge}`.
- Beim Verlassen außerdem: offene Bewerbungen nach *Aktion beim Verlassen* ([qualifications.md](qualifications.md)) und offene Support-Tickets nach *Tickets → Allgemein* ([support-tickets.md](support-tickets.md)).

Braucht im Developer Portal den privilegierten **Server Members Intent** (Bot → Privileged Gateway Intents). Ohne ihn startet der Bot trotzdem, nur Beitritte/Austritte kommen nicht an.

## Roblox-Verifizierung (wie RoVer)
> **Vorerst abgeschaltet:** Menüpunkt, Befehle und das Setzen beim Beitritt sind deaktiviert; Code und gespeicherte Verknüpfungen bleiben für später erhalten.

*Administration → Roblox-Verifizierung*, je Server oder gemeinsam:
- **Ablauf:** Panel-Button **Verifizieren** oder `/verifizieren` → **Mit Roblox anmelden** (offizielle Roblox-Anmeldung, OAuth 2.0) → Rollen und Nickname kommen automatisch. Der Link gilt 10 Minuten und nur für dieses Mitglied. Eine Verifizierung gilt auf allen Servern.
- **Einrichten:** auf [create.roblox.com → Zugangsdaten → OAuth 2.0-Apps](https://create.roblox.com/dashboard/credentials?activeTab=OAuthTab) eine App anlegen, Scopes `openid` und `profile`, Redirect-URL `https://<eure-dashboard-adresse>/api/v1/verify/roblox/callback` (steht im Dashboard zum Kopieren). Client-ID und Secret im Dashboard eintragen oder als `ROBLOX_CLIENT_ID`/`ROBLOX_CLIENT_SECRET` setzen. Solange das fehlt, läuft die Verifizierung über fünf Wörter in „Über mich“ im Roblox-Profil.
- **Rollen:** *Verifiziert-Rollen* bekommt jeder Verifizierte; *Nicht-verifiziert-Rollen* bekommt, wer es noch nicht ist, und sie fallen danach weg. **Gruppen-Rollen**: Rang in einer Roblox-Gruppe (von–bis, 1–255) → Discord-Rollen.
- **Nickname:** Vorlage mit `{roblox-name}`, `{display-name}`, `{discord-name}`, `{roblox-id}` (höchstens 32 Zeichen; leer = nicht ändern).
- **Beim Beitritt** (Schalter): Verifizierte bekommen sofort Rollen und Nickname, alle anderen die Nicht-verifiziert-Rollen (braucht den „Server Members“-Intent).
- **Dashboard:** Liste aller Verifizierten mit Suche, Rollen neu setzen und Verifizierung entfernen; optional Log-Kanal.
- Ist das Discord-Konto mit einem Dashboard-Benutzer verknüpft, bekommt dieser das bestätigte Roblox-Konto (falls dort noch keins steht), ebenso die CAD-Zuordnung.
- Voraussetzungen in Discord: Bot-Rolle **über** den vergebenen Rollen, Rechte „Rollen verwalten“ und „Spitznamen verwalten“. Den Server-Besitzer kann Discord nicht umbenennen.

## Abmeldungen (Leave of Absences)
*Administration → Leave of Absences*: Modul einschalten, **Leave Approval Channel** (Anträge mit Buttons *Annehmen* / *Ablehnen* / *Ablehnen mit Grund*), **Leave Logs Channel** (angenommen, abgelehnt, beginnt, beendet …), **On Leave Role** und die längste erlaubte Dauer.
- Beantragen: `/abmeldung` in Discord oder *Organisation → Leave* im Dashboard (Recht `leave.request`, haben alle *Police Member*).
- Entscheiden: Recht `leave.manage` (*Police Administration*), per Button im Freigabe-Channel oder im Dashboard. Die Person bekommt eine Direktnachricht.
- Die Rolle kommt automatisch zum **Beginn** und geht zum **Ende** (Prüfung jede Minute); „End now“ / „Withdraw“ beendet vorzeitig. Alle Abmeldungen sehen: `leave.view` (*Supervisor*).

## Mit Discord anmelden (wie bei Dyno)
Auf der Login-Seite erscheint **„Mit Discord anmelden“**, sobald `DISCORD_CLIENT_SECRET` gesetzt ist (Developer Portal → OAuth2 → Client Secret; die Client-ID wird aus `DISCORD_TOKEN` gelesen). Im Developer Portal unter **OAuth2 → Redirects** muss `https://<deine-domain>/api/v1/auth/discord/callback` stehen (`WEB_ORIGIN` muss genau diese Domain sein).
- Discord fragt nur nach dem Benutzernamen (Scope `identify`) – kein Passwort, keine E-Mail.
- **Bestehende Konten**: wer schon verknüpft ist (im Web „Mit Discord verknüpfen“), landet direkt im eigenen Konto.
- **Neue Personen** bekommen beim ersten Login automatisch ein Konto – nur wenn sie auf eurem Discord-Server sind (abschaltbar) und zunächst **ohne Rechte**.
- **Rollen wie bei Dyno** (*Settings → Sign in with Discord*): Discord-Rolle → Systemrolle, z. B. „Polizei“ → *Police Member*. Wird bei jeder Discord-Anmeldung abgeglichen (dazu/weg); andere Rollen bleiben unberührt.
- **Nur Discord:** Sobald `DISCORD_CLIENT_SECRET` gesetzt ist, zeigt die Login-Seite nur noch „Mit Discord anmelden“ und die API lehnt Passwort-Anmeldungen ab. Vorher (Einrichtung) gilt der Passwort-Login.
- **Team-Rolle fürs MDT:** Unter *Settings → Sign in with Discord → Team role* eine oder mehrere Discord-Rollen-IDs eintragen. Dann kommt nur ins MDT/Dashboard, wer eine davon auf dem Server hat (geprüft bei jeder Anmeldung; Login-Seite: „Dir fehlt die Team-Rolle“). Leer = jedes Server-Mitglied. Welche Rechte jemand bekommt, steuert weiterhin *Discord role → system role*.
- **Nicht aussperren:** Deine Discord-ID gehört in `ADMIN_DISCORD_IDS` – diese Konten sind beim Discord-Login immer *System Administrator* (auch ohne Server-Mitgliedschaft). **Notfall-Zugang:** `PASSWORD_LOGIN=true` setzen und neu starten, dann ist der Passwort-Login (z. B. `admin`) wieder da. Passwort vergessen: zusätzlich `ADMIN_PASSWORD=<neu>` + `ADMIN_PASSWORD_RESET=true` (siehe [hosting-bot-hosting.md](hosting-bot-hosting.md)).

## Neu: Discord-Nachrichten aus dem Dashboard

- **Funk-Codes** (`/radio-codes` → „In Discord senden“): Liste je Kategorie als Embed; bei Änderungen automatisch aktualisiert (abschaltbar).
- **Staff-Liste** (`/staff-lists`): Abschnitte je Discord-Rolle (Reihenfolge, Überschrift, Trennlinie, „/“ wenn leer, nur höchste Rolle). Der Bot rechnet die Mitglieder selbst und bearbeitet die Nachricht, sobald sich Rollen ändern (Intent „Server Members“ nötig).
- **Formular-Panels** (`/admin/form-panels`): Panel mit Button → Formular (bis 5 Felder) → Nachricht im Zielkanal, optional mit Name/Profilbild der Person (Bot braucht „Webhooks verwalten“), Reaktionen, Rollen-Ping, Rollen vergeben, „einmal je Person“.
- **Tages-/Wochenberichte** (`/duty-reports`, `/dienstbericht ausfuellen|meine|anzeigen`): Vorlagen mit eigenen Feldern; mehr als 5 Felder → mehrseitiges Formular mit „Weiter“. Gepostete Berichte haben „✏️ Bearbeiten“; Änderungen im Dashboard aktualisieren die Nachricht.
- **Embed-Baukasten**: Bilder per „Datei hinzufügen“/„Datei einfügen“ (Zwischenablage) – der Bot hängt sie an; bis zu 4 Bilder, Autor-/Fußzeilen-Icon, eigenes Datum/Zeit, Reaktionen.
- **Personal**: Beförderungen tauschen Rang-Rollen, Dienstnummern setzen den Nickname (Bot braucht „Nicknames verwalten“) und schicken eine DM.
