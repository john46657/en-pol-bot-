# Database

PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`). UUID primary keys, foreign keys, unique constraints and indexes throughout.

- Migrations: `prisma/migrations/*`. Dev: `pnpm db:migrate:dev`. Production: `prisma migrate deploy` (runs on container start). **Never** use `db push` or `migrate reset` against production.
- `AuditLog` is append-only: DB triggers reject UPDATE, DELETE and TRUNCATE (see `init` migration).
- Optimistic locking: `version` columns (Person, Incident, Report, …); stale writes return `409 CONFLICT`.
- Dedupe: `RecordLink` unique on (person, entityType, entityId, role); 
- Not implemented in the schema yet: record locking ("currently edited by …").

Local dev DB: `pnpm --filter @enrp/api dev:db` (embedded PostgreSQL on port 54329).
