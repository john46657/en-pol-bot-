#!/usr/bin/env bash
# Einmalige Einrichtung auf dem Zielsystem (Linux): Abhängigkeiten, Prisma-Client, Build, Dashboard mit gleicher Herkunft.
# Danach starten: node scripts/start-all.mjs   (spielt Migrationen selbst ein)
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Node.js fehlt (Version 24 empfohlen)."; exit 1; }
node -e 'if (+process.versions.node.split(".")[0] < 20) { console.error("Node.js ist zu alt (mindestens 20, empfohlen 24)."); process.exit(1); }'
if ! command -v pnpm >/dev/null; then corepack enable 2>/dev/null && corepack prepare pnpm@10 --activate || npm install -g pnpm@10; fi
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @nexus/database exec prisma generate
pnpm -r build
# Dashboard: leere API-Adresse = Aufrufe gehen an die Adresse, von der es geladen wurde (eine Domain)
VITE_API_URL= pnpm --filter @nexus/dashboard build
echo "Fertig. Jetzt .env.production ausfüllen und starten: node scripts/start-all.mjs"
