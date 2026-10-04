#!/usr/bin/env bash
# Packt den committeten Stand (ohne node_modules, Tests-Artefakte, .env) als Quellpaket für das Hosting.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist-hosting
OUT="dist-hosting/nexus-hosting.tar.gz"
git archive --format=tar.gz --prefix=nexus/ -o "$OUT" HEAD
echo "Erstellt: $OUT ($(du -h "$OUT" | cut -f1)) – Stand $(git rev-parse --short HEAD)"
