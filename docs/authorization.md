# Authorization

Resolution order (implemented once in `packages/shared/src/permissions.ts`, used by guards and services):

1. user explicit **DENY** 2. user explicit **ALLOW** 3. role/group **DENY** 4. role/group **ALLOW** 5. default **DENY**

Grants support wildcards (`module.*`, `*`). Roles reach users directly or via groups. Controllers declare `@RequirePermission(...)`; object-level rules live in services (e.g. report visibility, complaint internal notes, media access follows the linked entity). Denials create `SecurityEvent PERMISSION_DENIED`.

Hidden-record rule: records a user may not see answer with `404`, and search/analytics only touch entity types the user may view.

Since the dashboard extension: roles have a **priority** (hierarchy), can be **disabled** and can belong to one Discord server (`guildId`, only valid when that server is selected – header `X-Guild-Id`). Managing roles/users is only allowed **below one's own rank**, and only permissions one holds can be granted. Area permissions `dashboard.<area>.view` hide whole sections. Details: [dashboard.md](dashboard.md).
