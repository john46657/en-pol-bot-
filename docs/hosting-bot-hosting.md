# NEXUS auf bot-hosting.net (ein Container, eine Domain)

**Ressourcen:** Mit 2048 MB RAM / 100 % CPU / 8 GB Speicher (im Panel unter „Resize“ einstellbar, Container startet dabei neu) reicht es für API + Bot + Worker (gemessen ≈ 190 + 70 MB + Bot). **Zusätzlich nötig: PostgreSQL und Redis** – das Panel stellt sie nicht bereit.

## 1. Datenbank und Redis (Entscheidung nötig)
| | PostgreSQL | Redis |
|---|---|---|
| **Extern, kostenlos** | z. B. Neon oder Supabase (`DATABASE_URL` mit `?sslmode=require`) – unproblematisch | z. B. Upstash (`rediss://…`) – **Vorsicht:** NEXUS fragt Redis laufend ab (Job-Warteschlange, Herzschläge); die Gratis-Kontingente (Befehle pro Monat) können dadurch aufgebraucht werden |
| **Im Container** | nur möglich, wenn das Panel Programme installieren/kompilieren lässt | dasselbe |
Zu klären (in der Konsole des Panels ausführen und das Ergebnis mitteilen): `node -v; which psql postgres redis-server gcc make git curl; uname -m; cat /etc/os-release | head -3`.

## 2. Paket erstellen und hochladen
Auf dem Entwicklungsrechner: `./scripts/package-hosting.sh` → `dist-hosting/nexus-hosting.tar.gz` (< 1 MB, reiner Quellcode). Im Panel in das Hauptverzeichnis des Bots hochladen und entpacken (`tar -xzf nexus-hosting.tar.gz`). Alternativ per `git clone`, falls das Repository erreichbar ist.

## 3. Einrichten (einmalig, in der Konsole des Panels)
```bash
cd nexus && ./scripts/hosting-setup.sh      # ca. 30–90 s; installiert, baut, baut das Dashboard (leere API-Adresse)
cp .env.production.example .env.production  # ausfüllen
```
In `.env.production` (alle Adressen = deine Domain, https):
```
DATABASE_URL=postgresql://…            REDIS_URL=redis://…
AUTH_SECRET=<openssl rand -hex 32>     JWT_ISSUER=nexus
DISCORD_TOKEN=…  DISCORD_CLIENT_ID=…  DISCORD_CLIENT_SECRET=…
DASHBOARD_URL=https://tnnyq4svmz.apps.bot-hosting.cloud
API_URL=https://tnnyq4svmz.apps.bot-hosting.cloud
AUTH_CALLBACK_URL=https://tnnyq4svmz.apps.bot-hosting.cloud/api/v1/auth/discord/callback
TRUST_PROXY=1
```
`PORT` bzw. `API_PORT` auf den Port stellen, den das Panel für die Domain vorsieht (wird `PORT` vorgegeben, nimmt `start-all` ihn automatisch).

## 4. Starten
Startbefehl des Panels: `node nexus/scripts/start-all.mjs` (bzw. im Ordner `nexus`: `node scripts/start-all.mjs`). Das Skript spielt Datenbank-Migrationen ein, startet API (mit eingebautem Dashboard), Worker und Bot, startet abgestürzte Dienste mit Wartezeit neu und beendet sie sauber bei Stopp. Beim ersten Start des Discord-Bots werden die Befehle global registriert (bis zu einer Stunde, bis Discord sie anzeigt).

## 5. Discord Developer Portal
Redirect-URI = `AUTH_CALLBACK_URL`; Intents „Server Members“ und „Message Content“ aktivieren.

## 6. Kontrolle
`https://<domain>/api/v1/health` → Datenbank, Redis, Bot, Worker „up“. Im Discord `/health`. Dashboard unter `https://<domain>/`.

## Updates
Neues Paket entpacken (`.env.production` behalten), `./scripts/hosting-setup.sh`, Container neu starten. **Vorher Datenbank sichern** (`scripts/backup.sh` bzw. Sicherung des Datenbank-Anbieters).

## Was geprüft ist (lokal)
Paket aus `git archive` → entpackt in leerem Ordner → `hosting-setup.sh` (33 s) → `start-all.mjs` mit frischer Datenbank: Migrationen laufen, API antwortet, Dashboard wird ausgeliefert (200), Worker „aktiv“, Datenbank/Redis „up“; Bot startet und scheitert mit ungültigem Token erwartungsgemäß mit Neustart-Wartezeit; SIGTERM beendet alle Dienste.
## Nicht geprüft
Alles auf dem Panel selbst (Node-Version, Schreibrechte, Ports, ob Pakete installiert werden dürfen), externe Datenbank/Redis, echte Discord-Verbindung.
