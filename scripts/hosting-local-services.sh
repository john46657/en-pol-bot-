#!/usr/bin/env bash
# Kompiliert PostgreSQL und Redis aus dem Quellcode in ein Verzeichnis OHNE Root-Rechte (für Hoster ohne vorinstallierte
# Datenbank, z. B. bot-hosting.net). Braucht gcc, make, curl, tar. Dauert je nach CPU ca. 5–15 Minuten.
# Ergebnis: $NEXUS_LOCAL/pgsql/bin/{postgres,initdb,psql,…} und $NEXUS_LOCAL/redis/bin/redis-server
set -euo pipefail
cd "$(dirname "$0")/.."
LOCAL="${NEXUS_LOCAL:-$(cd .. && pwd)/nexus-local}"
PG_VERSION="${PG_VERSION:-17.6}"
REDIS_VERSION="${REDIS_VERSION:-7.4.5}"
JOBS="${JOBS:-2}"   # wenig parallel: schont den Arbeitsspeicher des Containers
mkdir -p "$LOCAL/src"
for tool in gcc make curl tar; do command -v "$tool" >/dev/null || { echo "Es fehlt: $tool"; exit 1; }; done

if [ -x "$LOCAL/pgsql/bin/postgres" ]; then echo "PostgreSQL ist schon installiert."; else
  echo "== PostgreSQL $PG_VERSION =="
  curl -fL --retry 3 -o "$LOCAL/src/pg.tar.bz2" "https://ftp.postgresql.org/pub/source/v$PG_VERSION/postgresql-$PG_VERSION.tar.bz2"
  tar -xjf "$LOCAL/src/pg.tar.bz2" -C "$LOCAL/src"
  ( cd "$LOCAL/src/postgresql-$PG_VERSION"
    ./configure --prefix="$LOCAL/pgsql" --without-readline --without-zlib --without-icu --without-openssl >/dev/null
    make -j"$JOBS" >/dev/null && make install >/dev/null )
  "$LOCAL/pgsql/bin/postgres" --version
fi

if [ -x "$LOCAL/redis/bin/redis-server" ]; then echo "Redis ist schon installiert."; else
  echo "== Redis $REDIS_VERSION =="
  curl -fL --retry 3 -o "$LOCAL/src/redis.tar.gz" "https://download.redis.io/releases/redis-$REDIS_VERSION.tar.gz"
  tar -xzf "$LOCAL/src/redis.tar.gz" -C "$LOCAL/src"
  ( cd "$LOCAL/src/redis-$REDIS_VERSION" && make -j"$JOBS" >/dev/null && make PREFIX="$LOCAL/redis" install >/dev/null )
  "$LOCAL/redis/bin/redis-server" --version
fi
rm -rf "$LOCAL/src"
echo "Fertig. In .env.production: LOCAL_SERVICES=true (Datenbank und Redis starten dann mit NEXUS)."
