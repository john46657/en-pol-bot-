#!/usr/bin/env bash
# Neue Version einspielen (Datenbank-Migrationen laufen beim Start der API automatisch).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .git ] && git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
