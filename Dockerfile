# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @enrp/shared build && pnpm --filter @enrp/api build && pnpm --filter @enrp/web build && pnpm --filter @enrp/bot build
RUN pnpm --filter @enrp/api deploy --prod --legacy /out/api && cd /out/api && ./node_modules/.bin/prisma generate
RUN pnpm --filter @enrp/bot deploy --prod --legacy /out/bot

# ---- API ----
FROM node:22-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api /app
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrationen vor dem Start anwenden (nur `migrate deploy`, niemals `db push`/`migrate reset`)
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]

# ---- Discord-Bot ----
FROM node:22-bookworm-slim AS bot
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/bot /app
USER node
CMD ["node", "dist/index.js"]

# ---- Web (Caddy: statische Dateien + Reverse Proxy + automatisches HTTPS) ----
FROM caddy:2-alpine AS web
COPY --from=build /repo/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
