# MDT (web UI)

Routes: `/dashboard /dispatch /incidents /team /communication /persons /vehicles /reports /tickets /complaints /investigations /wanted /evidence /personnel /applications /academy /analytics /admin/*`. Navigation entries and route guards depend on the user's effective permissions; the API enforces the same rules.

The **MDT page** (`/mdt`) is the central portal: scoped search (everything / person / vehicle), permission-aware quick actions (create incident, report, ticket, complaint, investigation, wanted, evidence), and wanted/incident/report panels. The **Team dashboard** (`/team`) lists officers with rank, callsign, unit, duty status, current incident and last status change; users with `team.manage` can set others' duty status, users with `dispatch.assign` can move officers between units.

Global search: **Ctrl/Cmd+K** (name, Roblox ID, plate, I-/R-/T-/C-/CASE-/E- numbers), permission-aware on the server.

**Roblox lookup** (MDT search and Ctrl/Cmd+K, needs `persons.view`): type a Roblox **username**, a **Roblox ID** or paste a **profile link** – a card shows the Roblox account (avatar, display name, @name, ID, account age, banned on Roblox) with **Open person record** (if one exists, matched by ID or name) or **Create person record** (filled with name + ID, needs `persons.create`) and a link to the Roblox profile. The API (`GET /api/v1/persons/roblox?q=`) asks the public Roblox API (no token needed) and caches answers for 10 minutes; if Roblox is unreachable, the card simply doesn't appear.
Generic building blocks: `ResourcePage` (server-side pagination, search, status filter, create modal), `RecordPage` (details, timeline, permission-aware actions with required reasons), `DataTable`, `FormModal`, `PersonPicker`, `StatusBadge`/`PriorityBadge` (text, not colour only), loading skeletons, empty and error states (with request ID).
Studio (custom fields, accent) is documented in `studio.md`. Not implemented: virtualized tables, separate quick-action bar, Studio workflows.
