# Rechte

Der Katalog ist `PERMISSION_CATALOG` in `packages/shared/src/permissions.ts` (u. a. dashboard, team, dispatch, incidents, persons, vehicles, reports, complaints, investigations, wanted, evidence, personnel, leave, applications, academy, sek, qualifications, communication, analytics, audit, studio, settings, users, roles, cad). `dispatch.manage`, `persons.merge`, `users.*` und `roles.*` erweitern die Liste aus der ursprünglichen Planung.

Startrollen (`apps/api/src/seed/seed-lib.ts`, änderbar, Admins können weitere anlegen): Police Member, Senior Officer, Supervisor, Dispatch, Investigator, Training Staff, Police Administration, System Administrator (`*`).

Verwaltung unter **Einstellungen → Rollen & Rechte**, Ausnahmen je Benutzer unter **Einstellungen → Benutzer**. Jede Änderung wird auditiert (`role.*`, `user.override.*`).
