# NEXUS im Produktivbetrieb

## Bestandteile
| Dienst | Image-Ziel | Port | Zustand |
| --- | --- | --- | --- |
| API | `api` | 3000 | `GET /api/v1/health` (voll), `/api/v1/health/live` (nur Prozess); `/health` leitet weiter |
| Bot | `bot` | – | Herzschlag in Redis alle 30 s (Discord-Verbindung, Ping, Serverzahl); Befehl `/health` |
| Worker | `worker` | – | Herzschlag in Redis alle 30 s; Jobs im Dashboard unter „Automatisierung“ |
| Dashboard | `dashboard` | 8080 | `/healthz`; zeigt unten links den Systemstatus |
| PostgreSQL 17 / Redis 8 | Standard-Images | – | Healthchecks in `docker-compose.prod.yml` |

## Erstinbetriebnahme
1. `cp .env.production.example .env.production` und alle `CHANGE_ME` ersetzen (`openssl rand -hex 32` für `AUTH_SECRET`). Die API **verweigert in Produktion den Start** bei Platzhaltern, kurzem Secret oder Nicht-https-Adressen.
2. Datenbankschema: `docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate`
3. Start: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`
4. Reverse-Proxy mit TLS vor `127.0.0.1:3000` (API, **auch WebSocket** `/api/v1/live`) und `127.0.0.1:8080` (Dashboard); `TRUST_PROXY=1` setzen.
5. Discord Developer Portal: Redirect-URI = `AUTH_CALLBACK_URL`, „Server Members Intent“ aktivieren.
6. Kontrolle: `curl https://api.example.org/api/v1/health` und `/health` im Discord.

> Ohne Docker: siehe `docs/hosting-ohne-docker.md`.

## Updates
`git pull` → `run --rm migrate` → `up -d --build`. Migrationen sind vorwärtsgerichtet; vor jedem Update eine Sicherung ziehen.

## Backup-Konzept
- **Was:** Die PostgreSQL-Datenbank enthält alles Fachliche (Akten, Schichten, Audit, Konfiguration). Redis enthält nur Warteschlange, Zähler und Herzschläge – verloren gegangen ist dort nichts Wichtiges (Jobs werden vom Worker neu geplant).
- **Wie:** `scripts/backup.sh` (pg_dump, gzip, Integritätsprüfung, Aufbewahrung `KEEP_DAYS`, Standard 14). Täglich per Cron, z. B. `15 3 * * * cd /opt/nexus && ./scripts/backup.sh >> backups/backup.log 2>&1`.
- **Offsite:** Das Verzeichnis `backups/` regelmäßig auf ein anderes System kopieren (rsync/rclone/S3) – eine Sicherung auf demselben Server schützt nicht vor Serververlust. *Das ist nicht automatisiert.*
- **Wiederherstellen:** Dienste stoppen, `scripts/restore.sh backups/<datei>` (fragt nach), `migrate`, Dienste starten. **Mindestens quartalsweise eine Wiederherstellung auf einer Testdatenbank üben.**
- Zusätzlich empfohlen: Provider-Snapshots des Servers/Volumes.

## Monitoring & Alarm
- Externer Uptime-Check (z. B. Uptime Kuma, Better Stack, Healthchecks.io) auf `https://api.example.org/api/v1/health`: **HTTP 503** = Datenbank nicht erreichbar → alarmieren. Im JSON bedeutet `"status":"degraded"` (HTTP 200), dass Redis, Bot, Worker oder Discord fehlen; dann in der Antwort die Komponente ansehen.
- Der Statuswert wird 5 s zwischengespeichert; ein Herzschlag gilt ab 75 s als verspätet (🟡), ab 120 s als fehlend (🔴).
- Docker startet Dienste bei Absturz neu (`restart: unless-stopped`); der API-Container hat einen Healthcheck.

## Fehlerprotokolle
- Alle Dienste loggen strukturiert auf stdout/stderr (API: Nest-Logger, Bot/Worker: pino JSON). Docker rotiert (10 MB × 5). Ansehen: `docker compose logs -f api bot worker`.
- Unerwartete API-Fehler (5xx) werden mit Methode, Pfad (ohne Query), Meldung und Stacktrace protokolliert – **nie** mit Anfrage-Inhalt, Header oder Cookies. Unbehandelte Fehler in Bot/Worker werden protokolliert.
- Fachliche Aktionen stehen unveränderlich im Audit-Log (Dashboard „Logs“).
- `SENTRY_DSN` steht in der Vorlage, ist aber **nicht angebunden** (kein Sentry-Code vorhanden).

## Sicherheit im Betrieb
Container laufen als Nicht-Root-Benutzer, Ports der API/Dashboard nur auf `127.0.0.1` (Zugriff über den Proxy), Postgres/Redis sind nicht veröffentlicht. Geheimnisse nur in `.env.production` (nicht im Repository, nicht in Images – `.dockerignore`).
