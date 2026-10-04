#!/usr/bin/env sh
# NEXUS – Wiederherstellung aus einer Sicherung. ACHTUNG: überschreibt die Daten der Ziel-Datenbank!
#   ./scripts/restore.sh backups/nexus-20261004-031500.sql.gz            # Docker-Compose-Produktion
#   DATABASE_URL=postgresql://… ./scripts/restore.sh <datei>               # beliebige Datenbank
# Vorher Dienste stoppen (docker compose stop api bot worker) und danach die Migrationen laufen lassen.
set -eu
FILE="${1:?Sicherungsdatei angeben}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.production}"
gzip -t "$FILE"
printf 'Alle Daten der Ziel-Datenbank werden ersetzt. Zum Fortfahren "ja" eingeben: '
read -r answer
[ "$answer" = "ja" ] || { echo "Abgebrochen."; exit 1; }
if [ -n "${DATABASE_URL:-}" ]; then
  gunzip -c "$FILE" | psql -v ON_ERROR_STOP=1 "$DATABASE_URL"
else
  gunzip -c "$FILE" | $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U nexus nexus
fi
echo "Wiederherstellung abgeschlossen."
