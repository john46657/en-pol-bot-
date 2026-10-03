# Troubleshooting

- **API exits at start with `SESSION_SECRET must be set`** → set it in production.
- **Login works but UI stays on the login page / 401 everywhere** → the browser must reach the API on the same origin (use the Vite proxy or Caddy); `WEB_ORIGIN` must match the page origin exactly.
- **403 ORIGIN_REJECTED** → `WEB_ORIGIN` does not contain the origin of the page.
- **Dev: `Cannot set properties of undefined` in Nest** → don't run the API with `tsx`; use `pnpm --filter @enrp/api dev` (swc keeps decorator metadata).
- **Embedded PostgreSQL fails with `libicu…dylib` on macOS** → run `node scripts/hydrate-symlinks.js` inside the `@embedded-postgres/darwin-arm64` package.
