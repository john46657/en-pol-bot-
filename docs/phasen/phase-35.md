# Phase 35 – Produktionsrelease

**Stand:** abgeschlossen (2026-10-04) – mit der wichtigen Einschränkung, dass auf diesem Rechner **kein Docker** vorhanden ist: Die Images wurden **nicht gebaut**. Praktisch geprüft wurden stattdessen die Schritte, aus denen sie bestehen. Betriebsanleitung: [docs/production.md](../production.md).

## Geliefert
| Plan-Punkt | Ergebnis |
| --- | --- |
| **Production Docker Images** | `Dockerfile` (mehrstufig, Ziele `api`, `bot`, `worker`, `dashboard`, `migrate`), `.dockerignore`, Nicht-Root, `tini`, Healthcheck im API- und Dashboard-Image, nginx-Konfiguration mit Sicherheits-Headern |
| **Production Environment** | `docker-compose.prod.yml` (Postgres, Redis, migrate, api, bot, worker, dashboard; Healthchecks, Neustart, Log-Rotation, Ports nur lokal), `.env.production.example`; Konfigurationsprüfung der API (Phase 32) erzwingt echte Werte |
| **Datenbank Migrationen** | `migrate`-Ziel/-Dienst (`prisma migrate deploy`); geprüft: 21 Migrationen, **keine Abweichung** zwischen Migrationen und Schema (`prisma migrate diff`) |
| **Backup-Konzept** | `scripts/backup.sh` / `restore.sh`, Konzept in `docs/production.md` |
| **Monitoring / Health Checks** | neues Paket `@nexus/health`: Herzschlag-Schreiber (Bot, Worker) und Statusprüfung mit Zeitlimit |
| **API Health Endpoint** | `GET /api/v1/health` (öffentlich, 200 / 503 bei Datenbank-Ausfall, 5 s Cache, keine Geheimnisse), `/health/live`, Kurzadresse `/health` |
| **Bot Health Status** | Herzschlag + Slash-Befehl `/health` (nur Administratoren): API 🟢 Datenbank 🟢 Redis 🟢 Discord 🟢 Bot 🟢 Workers 🟢 |
| **Dashboard Health Status** | `HealthBadge` unten in der Seitenleiste (alle 60 s, Tooltip mit Einzelwerten), `/healthz` im Dashboard-Container |
| **Error Logging** | 5xx der API mit Ort und Stacktrace (ohne Inhalte), Worker fängt unbehandelte Fehler, Log-Rotation in Compose |

## Praktisch geprüft
- **Produktions-Bundle der API:** `pnpm deploy --legacy --prod` in ein leeres Verzeichnis, `prisma generate` im Zielbaum (genau die Schritte des Dockerfiles), dann `node dist/main.js` gegen die echte Datenbank + Redis → läuft; `/api/v1/health` liefert 200 mit allen Komponenten; `/health` → 307. Dabei fiel auf, dass `prisma generate` im Zielbaum zwingend nötig ist (Fehler `PrismaClient` nicht exportiert) – ist im Dockerfile berücksichtigt.
- **Herzschlag:** Der echte Worker-Prozess schreibt `nexus:health:worker` in Redis. Dabei fiel ein Fehler auf (erster Herzschlag ging vor der Redis-Verbindung verloren, Worker erschien 30 s als „down“) → behoben, Regressionstest.
- **Backup/Restore:** `backup.sh` gegen die Testdatenbank, `restore.sh` in eine neue Datenbank: 89 Tabellen und 21 Migrationseinträge identisch.
- **Konfigurationsprüfung:** `.env.production.example` unverändert → Startfehler (gewollt); mit echten Werten → nur die Redis-Warnung, die in Compose entfällt.
- **Tests:** `@nexus/health` (7: alle Zustände, Ausfälle, Zeitlimit, keine Geheimnisse, echtes Redis), E2E `/health`, Autorisierungs-Sweep bleibt grün.

## Bekannte Grenzen / ehrlich benannt
- **Docker-Images und Compose-Datei wurden nie ausgeführt** (kein Docker installiert). Erster Aufbau kann an Kleinigkeiten scheitern (z. B. Alpine-Pakete, Prisma-Engines für `linux-musl`, Build-Argumente). Bitte beim ersten Deployment `docker compose build` prüfen und Fehler melden.
- Bot- und Dashboard-Health wurden nicht gegen einen echten Discord-Bot bzw. im Browser gesehen (`/health`-Befehl und Badge sind nur typgeprüft/gebaut; Bot-Herzschlag per Test, nicht mit echter Gateway-Verbindung).
- Kein automatisches Offsite-Backup, kein Alarmversand (nur Anleitung für externen Uptime-Check); Sentry nicht angebunden; keine Metriken (Prometheus) – bewusst klein gehalten.
- TLS/Reverse-Proxy ist nicht Teil des Pakets (Anleitung nur als Hinweis).
- `pnpm audit` (offen seit Phase 32) wurde nicht ausgewertet → Phase 36.
