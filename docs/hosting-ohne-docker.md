# NEXUS ohne Docker betreiben (VPS / eigener Server)

Für Server ohne Docker. **Nicht auf einem echten Linux-Server ausprobiert** – geprüft ist der Ablauf lokal (siehe „Was geprüft ist“). Mit Docker gilt `docs/production.md`.

## Passt NEXUS auf das Panel bot-hosting.net?
**Nein.** Das bisherige Panel („all in one bot“) hat ca. 32 MB RAM und 192 MB Speicher. Gemessen (Produktionsmodus, leere Datenbank): **API ≈ 190 MB, Worker ≈ 70 MB RAM**, dazu der Bot (nicht gemessen, mit Discord-Verbindung) sowie PostgreSQL und Redis. Realistisch ist ein Server mit **mindestens 2 GB RAM** (1 GB wird eng) und ca. 2 GB Platz. Das Panel kann höchstens den *Bot* betreiben, wenn API und Datenbank woanders laufen; für NEXUS lohnt sich ein kleiner VPS.

## Nur eine Domain: Dashboard und API unter derselben Adresse
Die API kann das Dashboard selbst ausliefern – dann genügen **eine Adresse und ein Prozess** (kein Proxy, keine zweite Domain nötig, solange der Anbieter TLS vor die Adresse setzt, wie es Panels wie bot-hosting.net tun).
1. Dashboard mit **leerer** API-Adresse bauen: `VITE_API_URL= pnpm --filter @nexus/dashboard build` (es spricht dann die Adresse an, von der es geladen wurde, auch für die Live-Verbindung).
2. In der Umgebung `DASHBOARD_STATIC_DIR=/opt/nexus/apps/dashboard/dist` setzen.
3. Alle Adressen sind dieselbe Domain, z. B. `https://meine-domain.example`: `DASHBOARD_URL=https://meine-domain.example`, `API_URL=https://meine-domain.example`, `AUTH_CALLBACK_URL=https://meine-domain.example/api/v1/auth/discord/callback` (im Discord Developer Portal als Redirect-URI eintragen).
Die API liefert `index.html` für alle Dashboard-Adressen (nie für `/api`, `/uploads`, `/docs`, `/health`), mit Sicherheits-Headern; Dateien aus `assets/` werden ein Jahr zwischengespeichert. Geprüft: Unit-Tests, echter Start im Produktionsmodus, Seite im Browser geladen (`/login`, Aufrufe relativ an dieselbe Herkunft, Login-Knopf zeigt auf dieselbe Adresse). **Nicht geprüft:** der komplette Discord-Login (kein Test-Token).

## Voraussetzungen
Node.js 24, pnpm (`corepack enable`), PostgreSQL 17, Redis 8, ein Reverse-Proxy mit TLS (Caddy/nginx; Vorlage `deploy/nginx-dashboard.conf`), zwei Adressen mit https (API und Dashboard).

## Einrichtung
```bash
git clone <repo> /opt/nexus && cd /opt/nexus
corepack enable && pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @nexus/database exec prisma generate
pnpm -r build
VITE_API_URL=https://api.example.org pnpm --filter @nexus/dashboard build   # statische Dateien in apps/dashboard/dist
cp .env.production.example .env.production   # ausfüllen; zusätzlich DATABASE_URL und REDIS_URL setzen (die Vorlage nennt nur POSTGRES_PASSWORD für Docker)
set -a; . ./.env.production; set +a
(cd packages/database && pnpm exec prisma migrate deploy)   # 30 Migrationen
```
Wichtige Variablen: `DATABASE_URL=postgresql://nexus:…@localhost:5432/nexus`, `REDIS_URL=redis://localhost:6379`, `AUTH_SECRET` (`openssl rand -hex 32`), `JWT_ISSUER`, `DASHBOARD_URL` (https), `API_URL`, `AUTH_CALLBACK_URL`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `TRUST_PROXY=1`, optional `API_PORT` (Standard 3000), `STORAGE_DIR` (Ablage der hochgeladenen Dashboard-Bilder; **sichern!**). Die API startet in Produktion **nicht** bei Platzhaltern, zu kurzem Secret oder nicht-https-Adressen.

## Dienste (systemd)
Je Dienst eine Unit, z. B. `/etc/systemd/system/nexus-api.service`:
```ini
[Unit]
Description=NEXUS API
After=network.target postgresql.service redis.service
[Service]
User=nexus
WorkingDirectory=/opt/nexus/apps/api
EnvironmentFile=/opt/nexus/.env.production
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
```
Dasselbe für `nexus-bot` (`apps/bot`, `node dist/index.js`) und `nexus-worker` (`apps/worker`, `node dist/index.js`). Dann `systemctl enable --now nexus-api nexus-bot nexus-worker`. Das Dashboard besteht nur aus statischen Dateien (`apps/dashboard/dist`) – vom Proxy ausliefern, alle Pfade auf `index.html` zurückfallen lassen. Der Proxy muss für die API auch **WebSocket** (`/api/v1/live`) durchreichen.

## Discord Developer Portal
Redirect-URI = `AUTH_CALLBACK_URL`; „Server Members Intent“ und „Message Content Intent“ aktivieren (Letzteres für Ticket-Transcripts).

## Kontrolle
`curl https://api.example.org/api/v1/health` → `"status":"ok"` (bei `degraded` fehlt Bot, Worker oder Discord; HTTP 503 = Datenbank weg). Im Discord `/health`.

## Updates
`git pull` → `pnpm install --frozen-lockfile --ignore-scripts` → `prisma migrate deploy` → `pnpm -r build` (+ Dashboard bauen) → Dienste neu starten. **Vorher `scripts/backup.sh`** (Sicherung der Datenbank). Hinweis: Nach Änderungen an Paketen müssen alle Pakete neu gebaut werden (`pnpm -r build`), die Dienste laden die gebauten Dateien.

## Was geprüft ist (lokal, macOS)
- Alle 30 Migrationen laufen auf einer **frischen** Datenbank durch („Database schema is up to date“).
- API aus dem gebauten Stand im Produktionsmodus: startet mit gültiger Konfiguration (`/health/live` ok, `/health` meldet Datenbank und Redis „up“), **bricht ab** bei Platzhalter-Secret und bei http-Dashboard-Adresse; geschützte Endpunkte (`wanted`, `restrictions`) antworten ohne Anmeldung mit 401.
- Worker startet gegen Datenbank und Redis.
## Nicht geprüft
Betrieb auf einem echten Linux-Server mit systemd, Proxy/TLS, der Bot mit echter Discord-Verbindung, Docker-Images (Docker fehlt auf dem Entwicklungsrechner), automatische Offsite-Sicherungen.
