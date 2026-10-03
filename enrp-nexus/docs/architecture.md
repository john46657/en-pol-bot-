# Architecture

Monorepo (pnpm workspaces):

| Path | Purpose |
|---|---|
| `packages/shared` | Single source of truth shared by API and web: permission catalog, **permission resolver**, status enums and transition maps. Built with tsup (CJS + ESM). |
| `apps/api` | NestJS 11 REST API (`/api/v1`), Socket.IO gateway (`/ws`), Prisma 6 + PostgreSQL. |
| `apps/web` | React 19 + Vite + Tailwind 4 + TanStack Query + React Router 7 + React Hook Form + Zod. |

## Request flow
`RequestIdMiddleware` → `OriginMiddleware` (CSRF origin check) → `ThrottlerGuard` → `AuthGuard` (session cookie) → `PermissionGuard` (`@RequirePermission`) → Zod-validated controller → service → `prisma.$transaction` (record + link + timeline + audit + notification) → `AllExceptionsFilter` (uniform `{code,message,requestId}`).

## Principles
- Authorization lives in the backend. The frontend only hides UI.
- Cross-cutting concerns are central: `PermissionService`, `AuditService`, `TimelineService`, `nextStatus` (transitions), `linkPerson` (dedupe-safe links).
- Critical records are never physically deleted: archive / void / cancel / close.
- Audit (technical, append-only) and Timeline (operational history) are separate tables.
- Multi-server groundwork: optional `serverId` columns on persons, vehicles and incidents (unused today).
