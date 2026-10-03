# Persons

`/api/v1/persons`. Roblox user IDs are never guessed; duplicates are *hinted* (same username → `possibleDuplicates`) or *blocked* (same Roblox ID → 409). `POST /persons/:id/merge` requires `persons.merge` and `confirm:true`; links, tickets, vehicles, wanted records and timeline move to the target, the source is archived. Creating tickets, reports, complaints, incidents, investigations, wanted records or evidence with a person automatically links them (no duplicates) and writes timeline + audit.
