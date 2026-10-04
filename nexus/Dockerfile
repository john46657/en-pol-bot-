# NEXUS – Produktions-Images (Mehrstufig). Ziele: api | bot | worker | dashboard | migrate
#   docker build --target api -t nexus-api .
# Hinweis: Dieses Dockerfile wurde auf einem Rechner ohne Docker erstellt; der Ablauf (pnpm deploy --prod + prisma generate)
# wurde lokal nachgestellt und die API daraus gestartet, die Images selbst wurden aber nicht gebaut (siehe docs/phasen/phase-35.md).

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && apk add --no-cache openssl
WORKDIR /repo

# --- Abhängigkeiten + Build -----------------------------------------------------------------------------------------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps ./apps
COPY packages ./packages
COPY tsconfig.base.json turbo.json ./
# Lebenszyklus-Skripte (husky) sind im Container nicht nötig
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @nexus/database exec prisma generate && pnpm -r build
# Dashboard: API-Adresse wird zur Build-Zeit festgelegt
ARG VITE_API_URL=http://localhost:3000
RUN VITE_API_URL=$VITE_API_URL pnpm --filter @nexus/dashboard build

# Für jeden Dienst: nur Produktionsabhängigkeiten, danach Prisma-Client im Zielbaum erzeugen
FROM build AS deploy-api
RUN pnpm --filter @nexus/api deploy --legacy --prod /out && /repo/packages/database/node_modules/.bin/prisma generate --schema "$(ls -d /out/node_modules/.pnpm/@nexus+database*/node_modules/@nexus/database)/prisma/schema.prisma"
FROM build AS deploy-bot
RUN pnpm --filter @nexus/bot deploy --legacy --prod /out && /repo/packages/database/node_modules/.bin/prisma generate --schema "$(ls -d /out/node_modules/.pnpm/@nexus+database*/node_modules/@nexus/database)/prisma/schema.prisma"
FROM build AS deploy-worker
RUN pnpm --filter @nexus/worker deploy --legacy --prod /out && /repo/packages/database/node_modules/.bin/prisma generate --schema "$(ls -d /out/node_modules/.pnpm/@nexus+database*/node_modules/@nexus/database)/prisma/schema.prisma"

# --- Laufzeit-Images ----------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime-base
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production
WORKDIR /app
USER node
ENTRYPOINT ["/sbin/tini", "--"]

FROM runtime-base AS api
COPY --from=deploy-api --chown=node:node /out /app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/v1/health/live || exit 1
CMD ["node", "dist/main.js"]

FROM runtime-base AS bot
COPY --from=deploy-bot --chown=node:node /out /app
# Der Bot hat keinen Port; sein Zustand steht per Herzschlag in Redis (siehe /health der API)
CMD ["node", "dist/index.js"]

FROM runtime-base AS worker
COPY --from=deploy-worker --chown=node:node /out /app
CMD ["node", "dist/index.js"]

# Migrationen: einmalig vor dem Start der Dienste (`docker compose run --rm migrate`)
FROM build AS migrate
WORKDIR /repo/packages/database
USER node
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# Dashboard: statische Dateien über nginx (SPA-Fallback, Sicherheits-Header)
FROM nginxinc/nginx-unprivileged:1-alpine AS dashboard
COPY deploy/nginx-dashboard.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/dashboard/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
