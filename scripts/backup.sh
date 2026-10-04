#!/usr/bin/env sh
# NEXUS – Sicherung: Datenbank (PostgreSQL, komprimiert) und hochgeladene Design-Bilder, mit Aufbewahrung.
#   ./scripts/backup.sh                    # Docker-Compose-Produktion (Standard)
#   KEEP_DAYS=30 BACKUP_DIR=./backups ./scripts/backup.sh
#   UPLOADS_DIR=./data/uploads ...         # Bilder aus einem lokalen Ordner sichern (Compose: automatisch aus dem api-Container)
# Per Cron täglich ausführen, z. B.:  15 3 * * *  cd /opt/nexus && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.production}"
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/nexus-$(date +%Y%m%d-%H%M%S).sql.gz"
RAW="$FILE.sql.tmp"
trap 'rm -f "$RAW" "$FILE.tmp"' EXIT
# Erst in eine Datei und dann packen: In einer Pipeline (pg_dump | gzip) bliebe ein Fehler von pg_dump unbemerkt und es
# entstünde eine „gültige“, aber leere Sicherung.
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --no-owner --clean --if-exists "$DATABASE_URL" > "$RAW"
else
  $COMPOSE exec -T postgres pg_dump -U nexus --no-owner --clean --if-exists nexus > "$RAW"
fi
# Nur vollständige Dumps behalten: pg_dump schreibt am Ende eine Abschlusszeile
grep -q 'PostgreSQL database dump complete' "$RAW" || { echo "Sicherung fehlgeschlagen (Dump unvollständig)" >&2; exit 1; }
gzip -c "$RAW" > "$FILE.tmp"
gzip -t "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
find "$BACKUP_DIR" -name 'nexus-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "Sicherung ok: $FILE ($(wc -c < "$FILE") Bytes)"

# Hochgeladene Bilder (Logo, Hintergründe …). Ohne Bilder ist das kein Fehler; ein defektes Archiv wird nicht behalten.
UP="$BACKUP_DIR/nexus-uploads-$(date +%Y%m%d-%H%M%S).tar.gz"
if [ -n "${UPLOADS_DIR:-}" ]; then
  [ -d "$UPLOADS_DIR" ] && tar -C "$UPLOADS_DIR" -czf "$UP.tmp" . 2>/dev/null || true
else
  $COMPOSE exec -T api tar -C /data/uploads -czf - . > "$UP.tmp" 2>/dev/null || true
fi
if [ -s "$UP.tmp" ] && gzip -t "$UP.tmp" 2>/dev/null; then
  mv "$UP.tmp" "$UP"
  echo "Bilder gesichert: $UP ($(wc -c < "$UP") Bytes)"
else
  rm -f "$UP.tmp"
fi
find "$BACKUP_DIR" -name 'nexus-uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
