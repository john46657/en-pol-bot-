# Deployment

Docker Compose (`docker-compose.yml`): `db` (PostgreSQL 17), `api` (migrations run on start, non-root, healthcheck on `/health`), `web` (Caddy: static files, reverse proxy, automatic HTTPS).

```bash
cp .env.example .env   # set DOMAIN, POSTGRES_PASSWORD, SESSION_SECRET (openssl rand -hex 32)
docker compose up -d --build
docker compose exec api node dist/seed/run.js   # prints the initial admin password once (or set ADMIN_PASSWORD)
```

Health: `/health` (liveness), `/readiness` (database). They are not exposed through Caddy.

## Backups (PostgreSQL)
```bash
docker compose exec -T db pg_dump -U enrp -Fc enrp > backup-$(date +%F).dump        # backup
docker compose exec -T db pg_restore -U enrp -d enrp --clean --if-exists < backup.dump   # restore
```
Rotation example: nightly cron, keep 14 dailies + 8 weeklies (`find backups -mtime +14 -delete`). Also back up the `uploads` volume. Recovery test: restore into a scratch database before relying on a backup.

Data retention: `POST /admin/retention/run` (or schedule it) prunes expired sessions, old login history and read notifications; **audit logs are never deleted**.
