#!/usr/bin/env bash
# Neue Version einspielen (Datenbank-Migrationen laufen beim Start der API automatisch).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .git ] && git pull --ff-only
# Vor dem Update die Datenbank sichern (Format wie die täglichen Backups, einspielbar mit deploy/restore.sh).
# Schlägt die Sicherung fehl, bricht das Update ab – es wird nichts gelöscht.
if [ -n "$(docker compose ps -q --status running db 2>/dev/null)" ]; then
  mkdir -p backups/vor-update
  out="backups/vor-update/enrp-$(date +%Y%m%d-%H%M%S).sql.gz"
  docker compose exec -T db pg_dump -U enrp -d enrp | gzip > "$out"
  echo "Sicherung vor dem Update: $out"
fi
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
