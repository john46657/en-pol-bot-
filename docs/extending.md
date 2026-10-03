# Extending ENRP NEXUS

Three levels, from no-code to code.

## 1. No code (Admin → Studio / Settings)
- **Custom fields** on persons and vehicles, **accent colour**, **application form**, default **dashboard layout**, organisation name, retention.
- **Roles, permissions, per-user overrides**: Admin → Roles & Permissions / Users.
- **Legal codes**: Admin → Legal Codes.

## 2. Add a permission
1. Add the action to `PERMISSION_CATALOG` in `packages/shared/src/permissions.ts` (e.g. `evidence: [..., 'destroy']`).
2. `pnpm db:seed` registers it (idempotent). Grant it to roles in the UI (or add it to `STARTER_ROLES` in `apps/api/src/seed/seed-lib.ts` for new installs).
3. Protect endpoints with `@RequirePermission('evidence.destroy')`; hide UI with `can('evidence.destroy')`.

## 3. Add a new module (example: "Citations of Property" → `seizures`)
Follow an existing small module as template — **vehicles** (`apps/api/src/vehicles`, `apps/web/src/pages/resources.tsx`).

**Backend**
1. `apps/api/prisma/schema.prisma`: add the model (UUID id, `version Int @default(1)` for optimistic locking, indexes) → `pnpm db:migrate:dev --name seizures`.
2. `apps/api/src/seizures/`: `seizures.service.ts`, `seizures.controller.ts`, `seizures.module.ts`. Rules every service follows:
   - do multi-table writes inside `this.prisma.$transaction(async (tx) => …)`;
   - call `this.audit.record(actor, {…}, tx)` and `this.timeline.add(tx, {…})`;
   - link people with `linkPerson(tx, personId, 'Seizure', id)` (dedupe-safe);
   - generate numbers with `makeNumber('S')`; use `nextStatus(MAP, from, to)` for status changes;
   - never delete — archive/void/cancel with a reason.
3. Controller: `@RequirePermission(...)` on **every** route, bodies/queries through `zodBody(schema)`, lists through `pageQuery`.
4. Register the module in `apps/api/src/app.module.ts`.
5. If the status flow is new, define it in `packages/shared/src/statuses.ts` (+ test in `packages/shared/tests`).
6. Add it to global search (`search/search.controller.ts`, only behind the view permission) and exports if wanted.
7. Tests: copy the pattern in `apps/api/test/ops.test.ts` (403 without permission, happy path, audit + timeline rows, rollback). `test/security.test.ts` automatically fails if a route has no explicit authorization decision.

**Frontend**
1. `apps/web/src/pages/resources.tsx`: add a `ResourceConfig` (columns, create form fields) and a `RecordConfig` (detail fields + permission-aware actions).
2. `apps/web/src/nav.ts`: nav entry with `perm`. `apps/web/src/App.tsx`: two routes using `list(...)` / `rec(...)`.
3. Add it as a MDT quick action in `pages/Mdt.tsx` and/or a dashboard widget in `pages/Dashboard.tsx` if useful.

**Realtime** (optional): `this.rt.publish('room', 'event', {id})` after the transaction commits; add the room + required permission to `ROOM_PERMISSION` in `realtime/realtime.service.ts`; subscribe in the page with `useRealtime`.

## Add a Discord bot command
See the last section of [discord-bot.md](discord-bot.md) (new entry in `COMMANDS`; new API route only via the explicit bot allowlist).

## Conventions worth keeping
Permissions checked in the backend first; no secrets in code; Zod on all input; German or English UI text is fine but keep one language per screen; keep docs in `docs/` in sync with the code (they describe what exists, including what does not).

## Re-adding integrations
ER:LC (API connector + signed webhooks) and Galaxy AI (assistant with human-confirmed proposals) were removed for now. Their code, tests and docs are archived in `enrp-nexus-removed-erlc-galaxy.tar.gz` (next to the repo). To bring them back: restore `apps/api/src/{erlc,galaxy}`, re-add the `ERLC*`/`AIProposal` Prisma models + migration, the `erlc`/`galaxy` permission modules in `packages/shared/src/permissions.ts`, register the modules in `app.module.ts`, and re-add the UI pieces (`pages/admin/Erlc.tsx`, `components/GalaxyPanel.tsx`, nav/route/dashboard widget). Existing databases keep unused `erlc.*`/`galaxy.*` permission rows; they are harmless.
