# Datenbank

PostgreSQL über Prisma (`apps/api/prisma/schema.prisma`). Durchgehend UUID-Primärschlüssel, Fremdschlüssel, Eindeutigkeits-Regeln und Indizes.

- Migrationen: `prisma/migrations/*`. Entwicklung: `pnpm db:migrate:dev`. Produktion: `prisma migrate deploy` (läuft beim Start). **Nie** `db push` oder `migrate reset` gegen die Produktion verwenden.
- `AuditLog` ist nur anhängbar: DB-Trigger lehnen UPDATE, DELETE und TRUNCATE ab (siehe Migration `init`).
- Optimistisches Sperren: Spalten `version` (Person, Incident, Report, …); veraltete Schreibzugriffe liefern `409 CONFLICT`.
- Ohne Dubletten: `RecordLink` ist eindeutig über (Person, entityType, entityId, Rolle).
- Bearbeitungssperren („wird gerade bearbeitet von …“) liegen in `EditLock` (siehe [security.md](security.md)).
- Je Discord-Server getrennte Daten tragen die Spalte `serverId` (Akten-Bereich); Eindeutigkeit gilt dort je Bereich, z. B. `Personnel (serverId, userId)`, `HrRank (serverId, name)`. Hinweis: PostgreSQL behandelt `NULL` als verschieden – im gemeinsamen Bestand (`serverId` leer) sichert die API die Eindeutigkeit selbst ab.

Lokale Entwicklungs-DB: `pnpm --filter @enrp/api dev:db` (eingebettetes PostgreSQL auf Port 54329).
