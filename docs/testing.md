# Testing

```bash
pnpm test        # shared unit tests, bot tests (fake API), API integration tests (own embedded PostgreSQL), web component tests
pnpm lint && pnpm typecheck && pnpm build
```
API tests (`apps/api/test`) boot the full Nest app against a throw-away PostgreSQL, apply real migrations, and cover auth, RBAC (incl. user DENY > role ALLOW), Roblox ID, persons/vehicles/tickets (transaction rollback), dispatch/reports/complaints/investigations/wanted/evidence/personnel/applications/academy, search leakage, communication permissions, analytics gating, WebSocket authorization, exports, media validation, audit immutability. Set `TEST_DATABASE_URL` to use an external database.
## Browser E2E (Playwright)
```bash
pnpm e2e
```
Starts a throw-away PostgreSQL (:54340), the API (:3100) and Vite (:5174), seeds an admin, and drives the installed **Google Chrome** (`channel: 'chrome'`, no browser download). Specs (`e2e/core.spec.ts`, 11): login/logout, person→ticket, dispatch workflow, permission denial (UI + API), complaint workflow, public application→review, Studio custom field + theme, MDT search/quick action, Team dashboard, Discord link flow.
Not covered: load tests, other browsers, mobile viewports.
