# Applications

Public `POST /applications` (rate-limited 5/hour/IP) validates answers against the configurable form (`application.form` setting, edit in Studio). Workflow SUBMITTED → SCREENING → INTERVIEW → PENDING_DECISION → ACCEPTED | REJECTED | WITHDRAWN. Review steps need `applications.review`; accept/reject need `applications.decide` and a reason. Accepting does **not** create an account automatically. The public form is served at `/apply` (no login).
