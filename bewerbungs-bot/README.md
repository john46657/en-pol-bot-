# Bewerbungs-Bot

Eigenständiger Discord-Bot für Bewerbungen – mit **Dashboard im Browser** (Anmeldung über Discord).
Nachgebaut aus dem Bewerbungssystem des EN-Polizei-Bots, aber ohne CAD/MDT, ohne Datenbank und für **jeden Server** nutzbar.

**Was er kann**
- **Panels** in Discord: ein Button „Jetzt bewerben“ oder ein Auswahlmenü mit mehreren Bewerbungsarten (z. B. Team, Polizei, SEK)
- **Fragen per Direktnachricht** nacheinander – oder als **Formular im Browser** über einen persönlichen Link
- 4 Fragetypen: **Text** (Mindest-/Höchstlänge), **Auswahl** (eine/mehrere), **Rollen-Auswahl** (Rolle wird bei Annahme vergeben), **Roblox-Benutzer** (wird bei Roblox geprüft, Person bestätigt ihr Konto)
- Neue Bewerbung im **Team-Kanal** mit allen Antworten, Bewerber-Infos, **KI-Check**, Ping-Rollen, optional Team-Thread, und den Buttons
  **Annehmen · Ablehnen · Annehmen mit Grund · Ablehnen mit Grund · Verlauf · Ticket mit Bewerber öffnen**
- Entscheidung: **DM an die Person** (Text frei einstellbar), **Rollen** geben/nehmen, Nachricht wird grün/rot, Kopie in Kanal für angenommene/abgelehnte
- **Sperren** (Discord-ID oder Roblox), **Wartezeit**, **Zeitlimit**, erforderliche/gesperrte Rollen, „ausstehend“-Rolle, **Aktion beim Verlassen** des Servers
- **Dashboard**: Bewerbungen filtern/suchen, aufklappen, entscheiden, Prüfschritte (In Prüfung, Gespräch, Zurückziehen), interne Notizen,
  Verlauf, „in Bearbeitung“, Sperren, **Statistik** (Kennzahlen, Verlauf, je Art, Top-Prüfer, Heatmap), CSV-Export und die komplette **Einrichtung**
- Mehrere Server gleichzeitig – jeder Server hat eigene Einstellungen und Daten

> Getestet mit automatischen Tests und im Demo-Modus im Browser. **Gegen echtes Discord wurde der Bot noch nicht getestet.**

---

## 1. Ausprobieren ohne Discord (Demo)

```bash
cd bewerbungs-bot
npm install
npm run demo
```
Dann <http://localhost:3000> öffnen → „Mit Discord anmelden“ (im Demo-Modus ohne echtes Discord). Was der Bot in Discord tun würde, steht in der Konsole.

## 2. Einrichten

**Voraussetzung:** Node.js 18.17 oder neuer.

1. **Discord Developer Portal** → <https://discord.com/developers/applications> → *New Application*
   - **Bot** → *Reset Token* → Token kopieren
   - Optional: **Server Members Intent** einschalten (nur nötig für „Aktion beim Verlassen“)
   - **OAuth2** → *Client Secret* kopieren; unter **Redirects** eintragen: `https://deine-adresse/auth/callback`
2. **Bot einladen** (Client-ID einsetzen):
   ```
   https://discord.com/oauth2/authorize?client_id=DEINE_CLIENT_ID&scope=bot+applications.commands&permissions=309506198544
   ```
   Rechte: Rollen verwalten, Kanäle verwalten, Kanäle ansehen, Nachrichten senden, Links einbetten, Dateien anhängen, Nachrichtenverlauf lesen, öffentliche Threads erstellen, in Threads schreiben.
   Die **Bot-Rolle muss über den Rollen stehen**, die er vergeben soll (Servereinstellungen → Rollen).
3. `.env.example` nach `.env` kopieren und ausfüllen:

   | Einstellung | Bedeutung |
   |---|---|
   | `DISCORD_TOKEN` | Bot-Token |
   | `DISCORD_CLIENT_ID` | Application ID |
   | `DISCORD_CLIENT_SECRET` | Client Secret (Dashboard-Login) |
   | `PUBLIC_URL` | Adresse des Dashboards, z. B. `https://bewerbung.example.de` (ohne `/` am Ende) |
   | `SESSION_SECRET` | langer Zufallswert, mind. 32 Zeichen (z. B. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `PORT` | Port des Webservers (Standard 3000; `SERVER_PORT` wird auch erkannt) |
   | `DATA_DIR` | Datenordner (Standard `./data`) |
   | `MEMBERS_INTENT` | `true` = Server-Members-Intent nutzen |
   | `ROBLOX_LOOKUP` | `off` = keine Abfrage bei Roblox |
   | `TIMEZONE` | Zeitzone der Statistik (Standard `Europe/Berlin`) |
4. Starten:
   ```bash
   npm install
   npm start
   ```
5. Dashboard öffnen → mit Discord anmelden → Server wählen → **Einrichtung**:
   - Bewerbungsart(en) anlegen: Fragen, Kanal für offene Einsendungen, Texte, Rollen, Manager-Rollen
   - **Panel** anlegen, Kanal wählen → **Senden** (oder im Kanal `/bewerbungspanel`)
   - Unter *Zugriff* Admin- und Prüfer-Rollen festlegen

Für den Browser-Modus und den Login muss `PUBLIC_URL` von außen erreichbar sein (bei Hostern wie bot-hosting.net: die Adresse/den Port des Servers verwenden; für HTTPS einen Reverse-Proxy wie Caddy oder nginx davorsetzen).

## 3. Wer darf was?

| Rolle | Darf |
|---|---|
| **Admin** – „Server verwalten“ oder Admin-Rolle | alles, inkl. Einrichtung, Löschen, CSV-Export |
| **Prüfer** – Prüfer-Rolle oder Manager-Rolle einer Bewerbungsart | Bewerbungen sehen und entscheiden, Notizen, Tickets, Sperren, Statistik |
| **Manager-Rollen** einer Bewerbungsart | Sind welche gesetzt, dürfen (neben Admins) **nur** diese über die Art entscheiden – und Prüfer sehen die Art nur mit dieser Rolle |

## 4. Discord-Befehle

| Befehl | Wer | Wirkung |
|---|---|---|
| `/bewerbung [art]` | alle | Bewerbung starten |
| `/bewerbungspanel [panel]` | Admins | Panel in diesen Kanal posten |
| `/bewerbungsverlauf person` | Prüfer | bisherige Bewerbungen einer Person |
| `/bewerbungssperre hinzufügen person grund [art] [tage]` | Prüfer | Person sperren |
| `/bewerbungssperre aufheben person` | Prüfer | Sperren aufheben |
| `/dashboard` | alle | Link zum Dashboard |

Während einer DM-Bewerbung: Antwort einfach in den Chat schreiben, `-` überspringt optionale Fragen, `abbrechen` bricht ab.

## 5. Texte – Variablen

`{applicationName}` Name der Bewerbung · `{user}` wer entschieden hat · `{applicant}` Bewerber · `{number}` Bewerbungsnummer ·
`{reason}` Grund · `{questionCount}` Anzahl Fragen · `{timeLimit}` Zeitlimit · `{server}` Servername.
Enthält der Annahme-/Ablehnungstext kein `{reason}`, wird ein Grund automatisch angehängt (nur wenn er an die Person gehen soll).

## 6. Daten & Sicherung

Alles liegt in `DATA_DIR/data.json` (keine Datenbank nötig). Täglich wird `DATA_DIR/backups/data-JJJJ-MM-TT.json` angelegt (14 Tage aufbewahrt).
Zum Umziehen einfach den `data`-Ordner mitnehmen. Laufende DM-Bewerbungen liegen nur im Speicher – nach einem Neustart müssen Bewerber neu starten.

## 7. Aufbau (für Entwickler)

| Datei | Inhalt |
|---|---|
| `src/index.js` | Start: `.env` laden, Bot + Webserver |
| `src/service.js` | Kernlogik: Einreichen, Prüfungen, Entscheiden, Sperren, Verlassen |
| `src/forms.js` | Fragetypen, Antwortprüfung, Texte/Variablen, Rollen-Regeln (auch im Browser genutzt) |
| `src/ai-check.js` | KI-Checker (lokal, ohne externen Dienst) |
| `src/analytics.js` | Statistik |
| `src/access.js` | Admin/Prüfer/Manager |
| `src/defaults.js` | Standard-Einstellungen + Prüfung der Dashboard-Eingaben |
| `src/store.js` | JSON-Speicher mit Sicherungen |
| `src/discord/bot.js` | Slash-Befehle, Buttons, Menüs, Formulare, DMs |
| `src/discord/flow.js` | Ablauf der DM-Bewerbung |
| `src/discord/messages.js` | Embeds und Buttons (reines JSON) |
| `src/discord/adapter.js` | Discord-Aktionen (DM, Rollen, Kanäle, Tickets, Panels) |
| `src/web/server.js` | Dashboard-API, Discord-Login, Browser-Formular |
| `src/web/public/` | Dashboard (`index.html`, `app.js`) und Formular (`apply.html`, `apply.js`) – ohne Build-Schritt |
| `src/demo.js` | Demo-Modus |

Tests: `npm test` (Kernlogik, DM-Ablauf, Discord-Interaktionen mit Attrappen, Web-API, Browser-Formular).

**Einbau in einen bestehenden discord.js-Bot:** `createDiscordAdapter`, `ApplicationService`, `DmFlow` und `wireBot` aus `src/` mit dem eigenen
`Client` aufrufen (siehe `main()` in `src/index.js`); der Client braucht die Intents `Guilds` + `DirectMessages` und `Partials.Channel`.
