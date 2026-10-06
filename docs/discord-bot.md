# 🤖 Discord-Bot

Der Bot (`apps/bot`, TypeScript, discord.js 14) ist ein **schlanker Client der System-API**. Er hat keine eigene Datenbank und keine eigenen Rechte: jeder Befehl läuft mit den Rechten des **verknüpften Benutzers**.

> **Ehrlich vorab:** Der Bot-Code, die API-Seite (Verknüpfung, Bot-Auth, Outbox) und die Befehlslogik sind automatisiert getestet (Befehle/Outbox mit Fake-API, API-Seite mit Integrationstests, Verknüpfung im Browser-E2E). **Gegen den echten Discord-Dienst wurde er nicht getestet** – dafür fehlen mir Bot-Token und Server. Plane beim ersten Start ein paar Minuten für Rechte/Channel-IDs ein und schick mir die Bot-Logs, falls etwas hakt.

## Befehle (30)
| Befehl | Zweck | Benötigtes Recht (im System) |
|---|---|---|
| `/verknuepfen code` | Discord-Konto mit Benutzer verknüpfen | – |
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
| `/dienststunden [tage] [alle]` | eigene Dienststunden der letzten 7 (1–90) Tage nach Status; mit `alle` die Stunden aller Beamten | `team.view` · `alle`: `team.manage` |
| `/dienstpanel` | postet das Dienst-Panel: Buttons **Im Dienst / Pause / Training / Verwaltung / Außer Dienst** (setzt den Status als verknüpfter Benutzer) | Discord „Server verwalten“; Klick: `team.view` |
| `/sek [aktion] [mitglied]` | SEK: Mitgliederliste, letzte Einsatzberichte, eigener Status; Mitglieder hinzufügen/entfernen (+ optionale SEK-Rolle) | `sek.view` · Status: `team.view` · verwalten: `sek.manage` |
| `/sek-bericht` | SEK-Einsatzbericht per Formular (Datum, Einsatzart, Beschreibung) | `sek.report` + SEK-Mitglied |
| `/qualipanel` | postet das Qualifikations-Panel (SEK, Flugstaffel, Ausbilder …): Auswahl → Fragen einzeln per DM → Bewerbung mit Annehmen/Ablehnen-Buttons im Team-Channel ([qualifications.md](qualifications.md)) | Discord „Server verwalten“; entscheiden: `qualifications.decide` |
| `/dienst status` | eigener Dienststatus: an, pause, training, verwaltung, aus | `team.view` |
| `/einheitstatus rufzeichen status` | Einheitenstatus ändern | `dispatch.edit` |
| `/einsatz titel [prioritaet] [ort]` | Einsatz anlegen | `incidents.create` |
| `/einsatzstatus nummer status` | Status: bestaetigt, unterwegs, vor_ort, in_bearbeitung, abschluss, abgebrochen, geschlossen | `dispatch.edit` (`geschlossen`: `dispatch.close`) |
| `/einsatzzuweisen nummer rufzeichen` | Einheit einem Einsatz zuweisen | `dispatch.assign` |
| `/funk kanal text` | Nachricht in Systemkanal team/dispatch | `communication.send` |
| `/ticket person grund [betrag]` | Ticket ausstellen (Person muss eindeutig sein) | `tickets.create` |
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
- **Gefahrenstatus-Panel** (`/gefahrenstatus aktion:panel hier posten`): Embed mit Buttons Grün/Gelb/Rot. Wer klickt, ändert den Status **mit seinen eigenen Rechten** (verknüpft + `dispatch.manage`). Das Panel zieht sich selbst nach – auch wenn der Status im Web (Leitstelle) geändert wird. Es gibt immer nur ein aktives Panel; ein neues ersetzt das alte (das alte wird nicht mehr bearbeitet).
- **Teamliste** (`/teamliste`): steht im Channel aus *Settings → Team list channel ID* (sonst im aktuellen Channel), gruppiert nach Rang (Reihenfolge: *Settings → Team list rank order*), mit Dienststatus. Abgleich alle `LIVE_REFRESH_SECONDS` (Standard 60 s); bearbeitet wird nur bei Änderungen. Gelöschte Nachricht → wird neu gepostet.
- **Support-Tickets**: komplett im Dashboard eingerichtet (*Operations → Support Tickets*): Panels werden von dort gesendet/aktualisiert – kein Slash-Command nötig. Kategorien, Fragen, Buttons, Rollen, Texte, Status, Prioritäten, Transcripts, Bewertungen, Automatik: [support-tickets.md](support-tickets.md).
- **Funk-Freigabe**: maßgeblich ist die Liste im System; ist *Radio role ID* gesetzt, vergibt/entzieht der Bot zusätzlich diese Discord-Rolle (Bot-Rolle muss **über** der Funkrolle stehen).
- **Bewerbung** (wie bei Appy): `/bewerbung` oder Button „Jetzt bewerben“ (`/bewerbungspanel`) → Direktnachricht „Bist du sicher …?“ mit *Bewerbung starten*/*Abbrechen* → der Bot fragt den Roblox-Namen und danach **jede Frage des Bewerbungsformulars einzeln** (bearbeiten unter *Qualifications → Setup*) (optionale Fragen mit „-“ überspringen; 3 Stunden Zeit). Die Roblox-ID wird über die Roblox-API ergänzt; eine offene Bewerbung pro Discord-Konto. Die Bewerbung erscheint wie bei Appy im **Applications channel** (Fragen fett + Antworten, Bewerber-Infos, Buttons Annehmen/Ablehnen – auch mit Grund –, Verlauf, Ticket, Dashboard). Bei Annahme/Ablehnung bekommt die Person eine **DM** (mit Grund nur, wenn „… mit Grund“ benutzt wurde; der interne Grund aus dem Web bleibt intern). Qualifikationen (SEK, Flugstaffel, Ausbilder) laufen genauso über `/qualipanel` ([qualifications.md](qualifications.md)).

## Automatische Benachrichtigungen
Neue/zugewiesene Einsätze (Dispatch-Channel), neue Fahndungen (Wanted-Channel), Ankündigungen aus dem Kommunikationsmodul (Announcements-Channel), neue Bewerbungen (Applications-Channel) und Änderungen des Gefahrenstatus (Danger-Channel). Die API legt sie in eine Outbox; der Bot holt sie alle 5 s ab, postet sie und quittiert. Fällt der Bot aus, bleiben Nachrichten in der Warteschlange und werden nachgeholt (nach 5 Fehlversuchen wird eine Nachricht verworfen und nach 7 Tagen gelöscht). **Ohne konfigurierte Channels wird nichts eingereiht.** Gepostet werden nur Kurzinfos (Nummer, Titel, Priorität, Ort bzw. Fahndungsgrund/-objekt). Pings (`@everyone` etc.) sind immer deaktiviert.

## Einrichtung

### 1. Discord Developer Portal (https://discord.com/developers/applications)
1. *New Application* → *Bot* → **Token** kopieren (nur einmal sichtbar).
2. **Message Content Intent** einschalten (*Bot → Privileged Gateway Intents*) – nur nötig, damit Nachrichten in Support-Tickets für Dashboard und Transcript mitgeschnitten werden. Ohne ihn startet der Bot trotzdem (dann ohne Verlauf).
3. *OAuth2 → URL Generator*: Scopes `bot` **und** `applications.commands`; Bot-Rechte: *View Channels*, *Send Messages*, *Embed Links* *Attach Files*, *Read Message History* – für Support-Tickets zusätzlich *Manage Channels* und *Manage Roles* (Kanalrechte), für die Funkrolle *Manage Roles*. URL öffnen → Bot auf deinen Server einladen.
4. Discord → Einstellungen → Erweitert → **Entwicklermodus** an. Rechtsklick auf deinen Server → *Server-ID kopieren*; Rechtsklick auf die Ziel-Channels → *Channel-ID kopieren*. Der Bot braucht in diesen Channels die Rechte *Kanal ansehen*, *Nachrichten senden*, *Links einbetten*.

### 2. Konfiguration
Gleiches Geheimnis in API **und** Bot (`openssl rand -hex 32`):
```
BOT_API_TOKEN=<64 Hex-Zeichen>      # API + Bot
DISCORD_TOKEN=<Token aus Schritt 1> # nur Bot
DISCORD_GUILD_ID=<Server-ID>        # optional, empfohlen: Commands erscheinen sofort. Mehrere Server: IDs mit Komma trennen (111…,222…)
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

## Mehrere Discord-Server
- **Befehle:** `DISCORD_GUILD_ID=111111111111111111,222222222222222222` – der Bot registriert die Slash-Commands auf jedem genannten Server (er muss auf allen eingeladen sein, mit Scope `applications.commands`). Schlägt einer fehl, steht das im Log, die anderen laufen weiter.
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
| Bot online, aber keine `/`-Befehle | `applications.commands`-Scope fehlte beim Einladen, oder ohne `DISCORD_GUILD_ID` dauert die globale Registrierung bis zu 1 h. |
| „Dein Discord-Konto ist nicht verknüpft“ | `/verknuepfen` mit frischem Code ausführen. |
| Bot meldet „nicht erreichbar“ | `API_URL` stimmt nicht (im Compose-Netz: `http://api:3000`) oder API ist down. |
| Benachrichtigungen kommen nicht | Channel-ID in *Settings* gesetzt? Bot hat im Channel Schreibrechte? `docker compose logs bot` zeigt `outbox … failed: Missing Access`. |
| Bot startet nicht: `Invalid bot configuration` | `DISCORD_TOKEN` / `BOT_API_TOKEN` (mind. 32 Zeichen, identisch zur API) fehlen. |

## Dienststatus ↔ Discord (Synchronisierung)
Jeder Statuswechsel – egal ob im **Dashboard**, per **`/dienst`**, per **Dienst-Panel** oder durch die **Schichtleitung** – wird an Discord weitergegeben:
- **Dienst-Rollen** (*Settings → Discord*: *On-duty role ID*, optional *Break / Training / Administrative role ID*): Im Dienst → Rolle vergeben, sonst entfernt; immer nur die Rolle des aktuellen Status. Gilt auf allen Servern, auf denen es die Rolle gibt. Voraussetzung: verknüpftes Konto (`/verknuepfen`), Bot-Rolle steht über den Dienst-Rollen und hat „Rollen verwalten“.
- **Dienst-Channel** (*Duty channel ID*): Meldung wie „🟢 A-11 · Oscar ist jetzt im Dienst“ bzw. „⚪ … außer Dienst – Vorher: im Dienst – 2 h 15 min“ (bei Schichtleitung: „Gesetzt von …“).
- **Teamliste** (`/teamliste`) wird sofort neu gezeichnet.

Ist weder Channel noch Rolle eingestellt, wird nichts eingereiht. Fällt der Bot kurz aus, werden die Änderungen nachgeholt.

## Mit Discord anmelden (wie bei Dyno)
Auf der Login-Seite erscheint **„Mit Discord anmelden“**, sobald `DISCORD_CLIENT_SECRET` gesetzt ist (Developer Portal → OAuth2 → Client Secret; die Client-ID wird aus `DISCORD_TOKEN` gelesen). Im Developer Portal unter **OAuth2 → Redirects** muss `https://<deine-domain>/api/v1/auth/discord/callback` stehen (`WEB_ORIGIN` muss genau diese Domain sein).
- Discord fragt nur nach dem Benutzernamen (Scope `identify`) – kein Passwort, keine E-Mail.
- **Bestehende Konten**: wer schon verknüpft ist (`/verknuepfen` oder im Web „Mit Discord verknüpfen“), landet direkt im eigenen Konto.
- **Neue Personen** bekommen beim ersten Login automatisch ein Konto – nur wenn sie auf eurem Discord-Server sind (abschaltbar) und zunächst **ohne Rechte**.
- **Rollen wie bei Dyno** (*Settings → Sign in with Discord*): Discord-Rolle → Systemrolle, z. B. „Polizei“ → *Police Member*. Wird bei jeder Discord-Anmeldung abgeglichen (dazu/weg); andere Rollen bleiben unberührt.
- **Nur Discord:** Sobald `DISCORD_CLIENT_SECRET` gesetzt ist, zeigt die Login-Seite nur noch „Mit Discord anmelden“ und die API lehnt Passwort-Anmeldungen ab. Vorher (Einrichtung) gilt der Passwort-Login.
- **Team-Rolle fürs MDT:** Unter *Settings → Sign in with Discord → Team role* eine oder mehrere Discord-Rollen-IDs eintragen. Dann kommt nur ins MDT/Dashboard, wer eine davon auf dem Server hat (geprüft bei jeder Anmeldung; Login-Seite: „Dir fehlt die Team-Rolle“). Leer = jedes Server-Mitglied. Welche Rechte jemand bekommt, steuert weiterhin *Discord role → system role*.
- **Nicht aussperren:** Deine Discord-ID gehört in `ADMIN_DISCORD_IDS` – diese Konten sind beim Discord-Login immer *System Administrator* (auch ohne Server-Mitgliedschaft). **Notfall-Zugang:** `PASSWORD_LOGIN=true` setzen und neu starten, dann ist der Passwort-Login (z. B. `admin`) wieder da. Passwort vergessen: zusätzlich `ADMIN_PASSWORD=<neu>` + `ADMIN_PASSWORD_RESET=true` (siehe [hosting-bot-hosting.md](hosting-bot-hosting.md)).
