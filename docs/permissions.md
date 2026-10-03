# Permissions

The catalog is `PERMISSION_CATALOG` in `packages/shared/src/permissions.ts` (dashboard, team, dispatch, incidents, persons, vehicles, reports, tickets, complaints, investigations, wanted, evidence, personnel, applications, academy, communication, analytics, audit, studio, settings, users, roles). `dispatch.manage`, `persons.merge`, `users.*` and `roles.*` extend the list from the specification.

Starter roles (`prisma/seed-lib.ts`, editable, admins can create more): Police Member, Senior Officer, Supervisor, Dispatch, Investigator, Training Staff, Police Administration, System Administrator (`*`).

Manage via **Admin → Roles & Permissions** and per-user overrides under **Admin → Users**. Every change is audited (`role.*`, `user.override.*`).
