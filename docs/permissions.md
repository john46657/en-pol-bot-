# Permissions

The catalog is `PERMISSION_CATALOG` in `packages/shared/src/permissions.ts` (dashboard, team, dispatch, incidents, persons, vehicles, reports, tickets, complaints, wanted, personnel, leave, applications, academy, sek, qualifications, communication, analytics, audit, studio, settings, users, roles). `dispatch.manage`, `persons.merge`, `users.*` and `roles.*` extend the list from the specification.

Starter roles (`prisma/seed-lib.ts`, editable, admins can create more): Police Member, Senior Officer, Supervisor, Dispatch, Investigator, Training Staff, Police Administration, System Administrator (`*`).

Manage via **Admin → Roles & Permissions** and per-user overrides under **Admin → Users**. Every change is audited (`role.*`, `user.override.*`).


**Erweiterungspaket 4.0:** neue Rechte `personnel.view_unit|notes_view|notes_create|notes_confidential|documents`, `qualification.*`, `training.materials`, `exam.conduct|results`, `org.*`, `backup.*`, `help.*` sowie die Berechtigungsmatrix (Zugriffsstufen je Rolle und Bereich) – siehe [erweiterungspaket-4.md](erweiterungspaket-4.md).
