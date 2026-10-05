# Personnel

Restricted (`personnel.*`). Reading a personnel file is audited (`personnel.read`). Promotions create a `PersonnelRecord` and notify the officer; nobody can change their own rank or record discipline against themselves. Employment status, callsign, team and qualifications are editable with `personnel.edit`. Duty sessions: `/team` (explicit status only — online presence is never treated as duty). Duty hours: `GET /team/me/hours?days=7` (own, `team.view`) and `GET /team/hours?days=7` (all officers, `team.manage`); sessions are clipped to the period, minutes per status.
