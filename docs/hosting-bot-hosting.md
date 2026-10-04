# NEXUS auf bot-hosting.net (ein Container, eine Domain, alles im Container)

**Ressourcen:** Mit 2048 MB RAM / 100 % CPU / 8 GB Speicher (im Panel unter „Adjust resources“ einstellbar, der Container startet dabei neu) reicht es für API + Bot + Worker (gemessen ≈ 190 + 70 MB + Bot) **und** PostgreSQL + Redis im selben Container. Im Panel sind `node` (v24), `gcc`, `make`, `git`, `curl` vorhanden (Debian 13, x86_64); PostgreSQL und Redis fehlen und werden **einmalig aus dem Quellcode kompiliert** (ohne Root-Rechte).

## Überblick
1. Paket erstellen (am Entwicklungsrechner) und ins Panel hochladen.
2. Einrichten: `hosting-setup.sh` (Abhängigkeiten, Build, Dashboard) und `hosting-local-services.sh` (PostgreSQL + Redis kompilieren, ca. 5–15 Minuten).
3. `.env.production` ausfüllen, Startbefehl setzen, starten.

## 1. Paket erstellen und hochladen
`./scripts/package-hosting.sh` → `dist-hosting/nexus-hosting.tar.gz` (< 1 MB, reiner Quellcode). Im Panel unter **Files** in den Hauptordner hochladen und in der Shell entpacken: `tar -xzf nexus-hosting.tar.gz` → Ordner `nexus/`. **Nicht** in den Hauptordner `/home/container` entpacken, sondern den Ordner `nexus` behalten (die Startzeile des Panels führt `npm install` im Hauptordner aus und würde eine fremde `package.json` dort verändern).

## 2. Einrichten (einmalig, in der Shell des Panels)
```bash
cd /home/container/nexus
./scripts/hosting-setup.sh              # 30–90 s: Abhängigkeiten, Build, Dashboard (gleiche Domain)
./scripts/hosting-local-services.sh     # 5–15 min: PostgreSQL 17 und Redis 7 kompilieren (Ziel: /home/container/nexus-local)
cp .env.production.example .env.production
```
Kompilieren lässt sich in der Shell des Panels ausführen; es braucht Arbeitsspeicher (das Skript nutzt nur 2 Prozesse parallel). Bricht die Verbindung ab, das Skript erneut starten – bereits Fertiges wird übersprungen.

## 3. `.env.production` (alle Adressen = deine Domain, https)
```
LOCAL_SERVICES=true                     # PostgreSQL + Redis im Container; DATABASE_URL/REDIS_URL sind dann nicht nötig
AUTH_SECRET=<openssl rand -hex 32>      JWT_ISSUER=nexus
DISCORD_TOKEN=…  DISCORD_CLIENT_ID=…  DISCORD_CLIENT_SECRET=…
DASHBOARD_URL=https://tnnyq4svmz.apps.bot-hosting.cloud
API_URL=https://tnnyq4svmz.apps.bot-hosting.cloud
AUTH_CALLBACK_URL=https://tnnyq4svmz.apps.bot-hosting.cloud/api/v1/auth/discord/callback
TRUST_PROXY=1
```
Port: Das Panel gibt ihn über `SERVER_PORT` bzw. `PORT` vor (steht im Reiter **Network**); `start-all` nimmt `PORT` automatisch, sonst `API_PORT=<Zahl>` setzen. Die Datenbank-Passwörter werden beim ersten Start erzeugt und liegen in `/home/container/nexus-local/secrets.json` (nur für den Besitzer lesbar); Datenbank und Redis sind **nur im Container (127.0.0.1)** erreichbar.

Alternativ ohne `LOCAL_SERVICES`: eigene `DATABASE_URL` und `REDIS_URL` (externe Datenbank) setzen.

## 4. Starten
Im Reiter **Startup** als Startdatei `nexus/scripts/start-all.mjs` eintragen (die Startzeile des Panels ruft `node ${STARTUP_FILE}` auf). Danach **Start**. `start-all` startet PostgreSQL und Redis, legt beim ersten Mal Datenbank und Passwörter an, spielt die Migrationen ein und startet API (mit Dashboard), Worker und Bot; abgestürzte Dienste werden mit Wartezeit neu gestartet; beim Stoppen werden zuerst die Anwendung, dann Redis, zuletzt PostgreSQL beendet (kein Datenverlust).

Hinweis zum Umstieg: Läuft derzeit der alte Bot („EN Polizei“) mit `start.js`, wird er durch diese Startdatei ersetzt. Beide laufen nicht gleichzeitig mit demselben Discord-Token.

## 5. Discord Developer Portal
Redirect-URI = `AUTH_CALLBACK_URL`; Intents „Server Members“ und „Message Content“ aktivieren. Die Befehle werden beim ersten Start global registriert (bis zu einer Stunde, bis Discord sie zeigt).

## 6. Kontrolle
`https://<domain>/api/v1/health` → Datenbank, Redis, Bot, Worker „up“. Dashboard: `https://<domain>/`. Im Discord `/health`.

## Sicherung
Die Daten liegen in `/home/container/nexus-local/pgdata` (PostgreSQL) und `redisdata`. Sicherung der Datenbank: `PATH=/home/container/nexus-local/pgsql/bin:$PATH DATABASE_URL='postgresql://nexus:<Passwort aus secrets.json>@127.0.0.1:5432/nexus' ./scripts/backup.sh` (das Skript nutzt `pg_dump`), die Dateien regelmäßig woandershin kopieren – ein Backup im selben Container schützt nicht vor dessen Verlust. Zusätzlich die Panel-Funktion **Backup** nutzen.

## Updates
Neues Paket in einen neuen Ordner entpacken (oder `nexus/` ersetzen, **`.env.production` und `nexus-local` behalten**), `./scripts/hosting-setup.sh`, Container neu starten. Migrationen laufen beim Start automatisch. Vorher Datenbank sichern.

## Was geprüft ist (lokal, macOS)
- Paket aus `git archive` → leerer Ordner → `hosting-setup.sh` → `start-all.mjs` mit `LOCAL_SERVICES=true`: PostgreSQL wird eingerichtet, Datenbank angelegt, 33 Migrationen laufen, API antwortet, Dashboard (200), Worker „aktiv“, Datenbank und Redis „up“.
- **Neustart:** keine erneute Einrichtung, Daten bleiben erhalten; **Beenden:** alle Prozesse enden, PostgreSQL fährt sauber herunter (Checkpoint); Stopp **während** des Hochfahrens hinterlässt keine Prozesse.
- Der Bot scheitert mit einem Fake-Token erwartungsgemäß und startet mit Wartezeit neu.
## Nicht geprüft
Alles auf dem Panel selbst: Kompilieren von PostgreSQL/Redis unter Debian 13 mit den Rechten des Containers, Schreibrechte, Ports, Verhalten bei Container-Neustarts durch das Panel, echte Discord-Verbindung.
