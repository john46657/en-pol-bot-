#!/usr/bin/env sh
# NEXUS – Datenbank-Sicherung (PostgreSQL, komprimiert) mit Aufbewahrung.
#   ./scripts/backup.sh                    # Docker-Compose-Produktion (Standard)
#   KEEP_DAYS=30 BACKUP_DIR=./backups ./scripts/backup.sh
# Per Cron täglich ausführen, z. B.:  15 3 * * *  cd /opt/nexus && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.production}"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/nexus-$(date +%Y%m%d-%H%M%S).sql.gz"
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --no-owner --clean --if-exists "$DATABASE_URL" | gzip > "$FILE.tmp"
else
  $COMPOSE exec -T postgres pg_dump -U nexus --no-owner --clean --if-exists nexus | gzip > "$FILE.tmp"
fi
# Nur vollständige Dateien behalten: leere/abgebrochene Sicherung ist ein Fehler
[ -s "$FILE.tmp" ] || { rm -f "$FILE.tmp"; echo "Sicherung fehlgeschlagen (leere Datei)" >&2; exit 1; }
gzip -t "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
find "$BACKUP_DIR" -name 'nexus-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "Sicherung ok: $FILE ($(wc -c < "$FILE") Bytes)"
