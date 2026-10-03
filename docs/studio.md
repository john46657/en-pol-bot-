# Studio

Requires `studio.view` / `studio.manage` (or `settings.manage`). All values are written via `PUT /api/v1/admin/settings/:key`, validated by a strict Zod schema per key, and audited (`studio.config.changed` with before/after).

| Key | What it does |
|---|---|
| `studio.customFields` | Custom fields for **persons** and **vehicles**: `key`, `label`, `type` (text, number, select, date), `required`, `options`. Keys are unique per entity. |
| `theme.accent` | Accent colour from a fixed palette (blue, green, amber, red, cyan, violet). The UI is always dark. |
| `application.form` | Public application form fields (`/apply`). |
| `dashboard.defaultLayout` | Default widget layout (users may override; reset returns to default). |

Custom field values live in `Person.custom` / `Vehicle.custom` (JSON). The server validates them on every create/update: unknown keys are rejected, types and required fields are enforced, partial updates keep existing values. Removing a definition hides the value in the UI but does not delete stored data.
`GET /api/v1/studio/config` (any signed-in user) returns organisation name, accent and field definitions for rendering.

## Not available
- **Workflows / configurable statuses.** Status machines (dispatch, reports, complaints, …) are fixed in `packages/shared/src/statuses.ts` on purpose: permissions, audit and tests depend on them.
- **Configurable priorities** (fixed LOW…CRITICAL), light theme, custom fields for other entities.
