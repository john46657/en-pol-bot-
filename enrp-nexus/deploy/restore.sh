#!/usr/bin/env bash
# Datenbank aus einem Backup wiederherstellen:  ./deploy/restore.sh backups/daily/enrp-YYYYMMDD-HHMMSS.sql.gz
# ACHTUNG: ersetzt den kompletten Datenbankinhalt.
set -euo pipefail
FILE="${1:-}"
[ -f "$FILE" ] || { echo "Usage: $0 <backup.sql.gz>"; exit 1; }
cd "$(dirname "$0")/.."
read -r -p "Das ÜBERSCHREIBT die aktuelle Datenbank. Mit 'ja' bestätigen: " ok
[ "$ok" = "ja" ] || { echo "Abgebrochen."; exit 1; }
docker compose stop api web
docker compose exec -T db psql -U enrp -d postgres -c "DROP DATABASE IF EXISTS enrp WITH (FORCE);" -c "CREATE DATABASE enrp OWNER enrp;"
gunzip -c "$FILE" | docker compose exec -T db psql -U enrp -d enrp -v ON_ERROR_STOP=1 >/dev/null
docker compose up -d
echo "Wiederherstellung abgeschlossen."
