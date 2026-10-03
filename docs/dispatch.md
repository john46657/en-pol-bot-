# Dispatch & incidents

- Incidents `I-YYYY-XXXXXX`; status machine `NEW → ACKNOWLEDGED → ASSIGNED → EN_ROUTE → ON_SCENE → PROCESSING → CLEARING → CLOSED` (+ `CANCELLED`), defined in `packages/shared/src/statuses.ts`.
- Units (`/dispatch/units`) with statuses AVAILABLE/BUSY/EN_ROUTE/ON_SCENE/UNAVAILABLE/OFF_DUTY. Assigning a unit marks it BUSY; closing/cancelling releases units.
- Persons/vehicles attach to incidents (deduped links, person timeline entry).
- Realtime: rooms `dispatch`, `incidents`, `team` (see authorization of subscriptions in `security.md`).
- Priorities are the fixed enum LOW…CRITICAL (not yet configurable in the UI). Radio/incident chat uses the communication module (`INCIDENT` channel exists in the API).
