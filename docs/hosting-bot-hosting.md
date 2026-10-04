# 🧩 Alles auf bot-hosting.net (Panel-Hosting)

Ziel: **ein einziges Paket** (`en-polizei-hosting.zip`) enthält API, Web-Oberfläche und Discord-Bot. Du lädst es in dein Panel, trägst die Datenbank ein, startest – fertig.

## ⚠️ Ehrliche Einordnung (bitte zuerst lesen)
| Thema | Stand |
|---|---|
| **Getestet** | Das Paket wurde so nachgestellt, wie ein Panel es verarbeitet: entpackt → `npm install` → `node start.js` gegen eine frische PostgreSQL-Datenbank. Migrationen, Admin-Anlage, Web-Oberfläche, Login (im echten Browser) funktionieren. |
| **Nicht getestet** | Dein konkretes Panel (Startkommando-Feld, Port-Freigabe, Datenbank-Verbindungsdaten) und der Bot gegen den echten Discord. Mit Panel-Besonderheiten kann es kleine Anpassungen brauchen – schick mir dann die Konsolen-Ausgabe. |
| **Arbeitsspeicher** | API + Datenbankzugriff + Bot brauchen realistisch **ca. 250–400 MB RAM**. Die kostenlose Stufe (ca. 128–256 MB) reicht dafür **voraussichtlich nicht**; plane den **Starter+/2-GB-Tarif** ein (Angaben bitte im Panel prüfen – sie ändern sich). |
| **Speicherplatz** | Nach `npm install` belegt das Paket ca. **370 MB** (Prisma-Engines). Free-Tarif mit 512 MB ist zu knapp. |
| **HTTPS** | Panels geben meist nur `IP:Port` **ohne HTTPS** aus. Ohne HTTPS laufen **Passwörter und Sitzungen unverschlüsselt** durchs Internet (jeder im selben WLAN/Netz-Pfad kann mitlesen). Für Tests okay – **für den echten Betrieb nicht**. Siehe „HTTPS“ unten oder nimm den VPS ([deployment.md](deployment.md)). |
| **Datenbank** | Es wird **PostgreSQL** benötigt (kein MySQL). Dein Panel muss eine PostgreSQL-Datenbank anbieten. |

## 1. Paket bauen (auf deinem Rechner)
```bash
cd enrp-nexus
pnpm install
pnpm bundle:hosting      # → dist-hosting/en-polizei-hosting.zip  (ca. 0,5 MB)
```
Die ZIP enthält vorkompilierten Code, **keine** `node_modules` (die haben Mac-Binaries; das Panel installiert die passenden für Linux).

## 2. Im Panel einrichten
1. **Neuen Server** anlegen, Sprache **Node.js** (Version **22 oder neuer**, 24 ist ideal).
2. **PostgreSQL-Datenbank** anlegen (Bereich „Databases“/„Datenbanken“). Notiere: Host, Port, Benutzer, Passwort, Datenbankname.
3. **ZIP hochladen** in den Datei-Manager des Servers und **entpacken**, sodass `start.js` und `package.json` direkt im Hauptverzeichnis liegen (nicht in einem Unterordner).
4. **Startdatei / Startbefehl**: `start.js` bzw. `node start.js` (alternativ `npm start`).
5. **Umgebungsvariablen** setzen (Bereich „Startup“/„Variables“) – oder die Datei `.env.example` in `.env` umbenennen und ausfüllen:
   ```
   DATABASE_URL=postgresql://BENUTZER:PASSWORT@HOST:PORT/DATENBANKNAME
   ADMIN_PASSWORD=<ein langes Passwort für den Benutzer "admin">
   ```
   Sonderzeichen im Passwort in der URL kodieren (`@` → `%40`, `#` → `%23`, `/` → `%2F`).
6. **Port**: Das Panel vergibt dem Server einen Port (Variable `SERVER_PORT`, wird automatisch genutzt). Er muss im Panel als **öffentlich erreichbarer Port („Allocation“)** freigegeben sein.
7. **Server starten.** Der erste Start dauert einige Minuten (`npm install`). In der Konsole siehst du u. a.:
   ```
   [nexus] Datenbank-Migrationen …
   [nexus] Erster Administrator …
   [nexus] Starte API + Web auf Port 25565 …
   ```
8. Seite öffnen: `http://<IP-aus-dem-Panel>:<Port>` → anmelden als `admin`.

> Fehlt `ADMIN_PASSWORD`, wird ein zufälliges Passwort erzeugt und **nur einmal** in der Konsole angezeigt. Schau sofort in die Logs.

### 2a. Wenn dein Panel eine Domain mit HTTPS bereitstellt (z. B. `https://xxxx.apps.bot-hosting.cloud`)
Dann hast du HTTPS – setze zusätzlich:
```
COOKIE_SECURE=true
WEB_ORIGIN=https://xxxx.apps.bot-hosting.cloud
```
- Die Domain wird vom Panel auf **einen Port deines Servers** geleitet (im Panel unter Netzwerk/Domains/Allocations zu sehen). Die App lauscht automatisch auf `SERVER_PORT`; stelle sicher, dass die Domain genau auf **diesen** Port zeigt.
- **502 Bad Gateway** im Browser heißt: Der Proxy des Panels läuft, aber dahinter antwortet deine App nicht → Server ist nicht gestartet, noch beim `npm install`/Start, abgestürzt (Konsole lesen) oder die Domain zeigt auf einen anderen Port.
- Test: `https://xxxx.apps.bot-hosting.cloud/health` muss `{"status":"ok"}` liefern.

## 3. Erste Schritte in der App
Eigenen Admin-Benutzer anlegen, Rollen/Rechte anpassen, Legal Codes eintragen, Benutzer + Personalakten anlegen – wie in [deployment.md](deployment.md) Abschnitt 4. Die Bewerbungsseite ist unter `/apply` erreichbar.

## 4. Discord-Bot dazuschalten
1. Bot im Developer Portal anlegen und auf den Server einladen – **Schritt für Schritt in [discord-bot.md](discord-bot.md)** (Abschnitt „Einrichtung“).
2. Im Panel zwei Variablen ergänzen und den Server neu starten:
   ```
   DISCORD_TOKEN=<Bot-Token>
   DISCORD_GUILD_ID=<Server-ID>
   ```
   Das Start-Skript startet den Bot dann automatisch **mit** (er spricht intern mit `127.0.0.1`; das Geheimnis zwischen API und Bot wird automatisch erzeugt und in `data/` gespeichert).
3. Channel-IDs unter *Admin → Settings → Discord bot channels* eintragen; Konten über das Chat-Symbol oben rechts verknüpfen.
4. Erwartete Konsolen-Zeilen: `Logged in as …` und `10 slash commands registered …` (Befehlszahl kann abweichen).

## 5. HTTPS (wichtig für echten Betrieb)
Mit `COOKIE_SECURE=true` werden Sitzungs-Cookies nur über HTTPS gesendet. Das setzt voraus, dass **vor** dem Server eine HTTPS-Schicht sitzt, z. B.:
- **Eigene Domain bei Cloudflare** (kostenlos) mit Proxy-Modus: Cloudflare liefert HTTPS, leitet an `http://<IP>:<Port>` weiter. Achtung: Cloudflare leitet nur an **bestimmte Ports** weiter (u. a. 80, 8080, 8880, 2052, 2082, 2086, 2095 für HTTP; 8443, 2053, 2083, 2087, 2096 für HTTPS-Ursprung). Ob dein Panel dir so einen Port zuteilen kann, weiß ich nicht – frag den Hoster/Support. Ich habe diesen Weg **nicht getestet**.
- **VPS mit Caddy** (empfohlen, alles vorbereitet): [deployment.md](deployment.md).

Solange du ohne HTTPS arbeitest: nur Testdaten verwenden, keine echten Passwörter, die du woanders benutzt, und `COOKIE_SECURE` leer lassen (das Start-Skript warnt dann deutlich).

## 6. Updates einspielen
1. Neues ZIP bauen (`pnpm bundle:hosting`).
2. Im Datei-Manager **alles außer `data/` und `.env`** überschreiben (ZIP entpacken, vorhandene Dateien ersetzen). `data/` enthält Geheimnisse und Uploads.
3. Server neu starten – Datenbank-Migrationen laufen automatisch.

## 7. Backups
- **Datenbank:** über das Datenbank-Backup/den Export deines Panels (Free-Tarife haben oft keine Backups → regelmäßig selbst exportieren).
- **Uploads & Geheimnisse:** Ordner `data/` herunterladen.

## 8. Fehlersuche
| Meldung / Problem | Ursache → Lösung |
|---|---|
| **502 Bad Gateway** | Panel-Proxy ok, App antwortet nicht: Server nicht gestartet / noch in der Installation / abgestürzt, oder Domain zeigt auf falschen Port (siehe 2a). Konsole prüfen. |
| `DATABASE_URL fehlt` / `muss mit postgresql:// beginnen` | Variable fehlt oder MySQL-URL. Es muss PostgreSQL sein. |
| `prisma migrate deploy ist fehlgeschlagen` | Zugangsdaten/Host falsch, Datenbank nicht erreichbar, oder der DB-Benutzer darf keine Tabellen/Trigger anlegen (Rechte des Datenbankbesitzers nötig). Meldung darüber in der Konsole lesen. |
| Server startet nicht / wird beendet („killed“, „out of memory“) | Zu wenig RAM → größeren Tarif nehmen. Notfalls `NODE_OPTIONS=--max-old-space-size=200` setzen. |
| `npm install` bricht ab / „no space left“ | Zu wenig Speicherplatz (Paket braucht ca. 370 MB nach Installation). |
| Seite nicht erreichbar | Port nicht öffentlich freigegeben, falsche IP, oder `http://` statt `https://` (ohne HTTPS-Schicht nur `http://`). |
| Login klappt, aber sofort wieder abgemeldet | `COOKIE_SECURE=true` gesetzt, aber Seite über `http://` geöffnet. Entweder HTTPS einrichten oder `COOKIE_SECURE` leer lassen. |
| Domain zeigt **502**, aber der Bot ist online | Es läuft nur der Bot oder die API lauscht auf einem anderen Port als dem der Domain. Prüfe die Konsole: Sie muss „Starte API + Web auf 0.0.0.0:<Port>“ und danach „API ist erreichbar: … /health → 200“ zeigen. (1) `bot.py` startet seit dieser Version `start.js` auch wenn `bot.js` daneben liegt (älter: `NEXUS_ENTRY=start.js` setzen oder `bot.js` löschen). (2) Der Panel-Port `SERVER_PORT` gewinnt jetzt vor `PORT`; entferne trotzdem die Variable `PORT`. (3) `API_URL` nicht setzen – der Bot nutzt im gemeinsamen Betrieb die lokale API. Die Domain muss im Panel auf den Server-Port zeigen. |
| Bot: `Invalid bot configuration` | `DISCORD_TOKEN` fehlt/ungültig. (`BOT_API_TOKEN` wird automatisch erzeugt.) |
| Bot online, aber keine `/`-Befehle | Beim Einladen fehlte der Scope `applications.commands`, oder ohne `DISCORD_GUILD_ID` dauert die Registrierung bis zu 1 h. |
