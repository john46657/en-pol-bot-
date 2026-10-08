# Architektur

Monorepo (pnpm-Workspaces):

| Pfad | Zweck |
|---|---|
| `packages/shared` | Gemeinsame Grundlage für API und Web: Rechtekatalog, **Rechte-Auflösung**, Status-Werte und erlaubte Statuswechsel. Gebaut mit tsup (CJS + ESM). |
| `apps/api` | NestJS-11-REST-API (`/api/v1`), Socket.IO-Gateway (`/ws`), Prisma 6 + PostgreSQL. |
| `apps/web` | React 19 + Vite + Tailwind 4 + TanStack Query + React Router 7 + React Hook Form + Zod. |
| `apps/bot` | Discord-Bot (discord.js), spricht nur über die API mit der Datenbank. |

## Ablauf einer Anfrage
`RequestIdMiddleware` → `OriginMiddleware` (CSRF-Prüfung der Herkunft) → `GuildContextMiddleware` (gewählter Discord-Server aus `X-Guild-Id`) → `ThrottlerGuard` → `AuthGuard` (Sitzungs-Cookie) → `PermissionGuard` (`@RequirePermission`) → Controller mit Zod-Prüfung → Service → `prisma.$transaction` (Eintrag + Verknüpfung + Zeitleiste + Audit + Benachrichtigung) → `AllExceptionsFilter` (einheitlich `{code,message,requestId}`).

## Grundsätze
- Berechtigungen prüft das Backend. Das Frontend blendet nur aus.
- Querschnittsaufgaben sind zentral: `PermissionService`, `AuditService`, `TimelineService`, `nextStatus` (Statuswechsel), `linkPerson` (Verknüpfungen ohne Dubletten).
- Wichtige Einträge werden nie physisch gelöscht, sondern archiviert, storniert, abgebrochen oder geschlossen.
- Audit (technisch, nur anhängen) und Zeitleiste (Einsatzverlauf) sind getrennte Tabellen.
- Mehrere Discord-Server: Akten (Personen, Fahrzeuge, Berichte, Fahndungen, …, Personal) tragen die Spalte `serverId` (Akten-Bereich). Die Trennung sitzt zentral im Datenbankzugriff (`apps/api/src/prisma/server-scope.ts`), die Leitstelle bleibt gemeinsam. Details: [dashboard.md](dashboard.md).
