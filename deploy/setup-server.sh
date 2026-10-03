#!/usr/bin/env bash
# Einmalige Einrichtung auf einem frischen Ubuntu-22.04/24.04-VPS.
# Aufruf (als root, im Projektordner):   sudo ./deploy/setup-server.sh nexus.deine-domain.de
set -euo pipefail

DOMAIN="${1:-}"
[ -n "$DOMAIN" ] || { echo "Usage: $0 <domain>   (DNS A-Record muss bereits auf diesen Server zeigen)"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "Bitte als root ausführen (sudo)."; exit 1; }
cd "$(dirname "$0")/.."

echo "==> Docker installieren (offizielles Skript von get.docker.com)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Firewall: nur SSH, HTTP, HTTPS"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
fi

if [ ! -f .env ]; then
  echo "==> .env mit zufälligen Geheimnissen erzeugen"
  umask 077
  cat > .env <<ENVEOF
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)
ENVEOF
else
  echo "==> .env existiert bereits – wird nicht überschrieben"
fi

echo "==> Bauen und starten (dauert beim ersten Mal einige Minuten)"
docker compose up -d --build

echo "==> Warten auf die API"
for i in $(seq 1 60); do
  [ "$(docker compose ps --format '{{.Health}}' api 2>/dev/null)" = "healthy" ] && break
  sleep 3
done

echo "==> Ersten Administrator anlegen (nur falls noch kein Benutzer existiert)"
docker compose exec -T api node dist/seed/run.js

cat <<DONE

Fertig. Öffne https://$DOMAIN  (das HTTPS-Zertifikat holt sich Caddy beim ersten Aufruf automatisch;
das klappt nur, wenn der DNS-A-Record auf diese Server-IP zeigt und Port 80/443 erreichbar sind).
Das oben angezeigte Admin-Passwort wird NUR EINMAL gezeigt – sofort ändern/speichern.
Logs ansehen:   docker compose logs -f api
DONE
