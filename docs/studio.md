# Studio

Requires `studio.view` / `studio.manage` (or `settings.manage`). All values are written via `PUT /api/v1/admin/settings/:key`, validated by a strict Zod schema per key, and audited (`studio.config.changed` with before/after).

| Key | What it does |
|---|---|
| `studio.customFields` | Custom fields for **persons** and **vehicles**: `key`, `label`, `type` (text, number, select, date), `required`, `options`. Keys are unique per entity. |
| `theme.accent` | Akzentfarbe: eine der 16 Vorgaben (blue, green, amber, red, cyan, violet, orange, pink, indigo, teal, lime, sky, rose, emerald, gold, slate) oder eine eigene Farbe `#rrggbb`. Hell/Dunkel wählt jeder unter *Persönlich*. |
| `theme.customAccents` | Eigene Akzentfarben mit Namen (Studio → Design → „Eigene Farbe hinzufügen“), bis 24. |
| `application.form` | Public application form fields (`/apply`). |
| `dashboard.defaultLayout` | Default widget layout (users may override; reset returns to default). |

Custom field values live in `Person.custom` / `Vehicle.custom` (JSON). The server validates them on every create/update: unknown keys are rejected, types and required fields are enforced, partial updates keep existing values. Removing a definition hides the value in the UI but does not delete stored data.
`GET /api/v1/studio/config` (any signed-in user) returns organisation name, accent and field definitions for rendering.

## Workflows (Automationen)

Studio → **Workflows** (`studio.view` ansehen, `studio.manage` ändern). Ein Workflow ist „**Wenn** Ereignis **und** Bedingungen → **dann** Aktionen“:

- **Ereignis:** jede Aktion aus dem Audit-Protokoll, z. B. `incident.create`, `cad.incident.create`, `report.submitted`, `wanted.create`, `leave.request`, `application.submit`; mit `*` am Ende für Gruppen (`report.*`). Der Editor schlägt die üblichen vor.
- **Bedingungen** (alle müssen passen) prüfen Felder des neuen Stands: ist / ist nicht / enthält / ist eins von / gesetzt / leer – z. B. `priority` ist eins von `HIGH, CRITICAL`.
- **Aktionen** (bis 5): Benachrichtigung an alle mit einem Recht, Benachrichtigung an eine Dashboard-Rolle, Discord-Meldung in bis zu 5 Kanäle (optional mit Rollen-Ping, Farbe). Titel/Text mit Platzhaltern `{{title}}`, `{{priority}}`, `{{location}}` …, `{{actor}}`, `{{action}}`.

Technik: Der Server liest alle 5 s die neuen (bestätigten) Audit-Einträge (`apps/api/src/workflows`). Jeder Workflow läuft je Ereignis genau einmal (`WorkflowRun`, mit Ergebnis/Fehler – „Läufe“ im Editor), höchstens 30-mal pro Minute. Neu angelegte oder wieder eingeschaltete Workflows wirken nur auf neue Ereignisse. Workflow-Aktionen erzeugen keine Audit-Ereignisse (keine Schleifen); Änderungen an Workflows werden auditiert (`studio.workflow.*`). Abschalten des Abrufs: `WORKFLOWS=false`. Benachrichtigungsart „⚙️ Workflows“ kann jeder für sich ausblenden.

## Not available
- **Configurable statuses.** Status machines (dispatch, reports, complaints, …) are fixed in `packages/shared/src/statuses.ts` on purpose: permissions, audit and tests depend on them. Workflows react to them but do not change them.
- **Configurable priorities** (fixed LOW…CRITICAL), light theme, custom fields for other entities.
