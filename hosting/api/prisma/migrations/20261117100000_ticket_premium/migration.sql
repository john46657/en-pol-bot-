-- Premium-Ticket-System: ausschließlich additive Änderungen (keine Spalte/Tabelle/Zeile wird gelöscht).

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "departmentId" UUID,
ADD COLUMN     "firstResponseDueAt" TIMESTAMP(3),
ADD COLUMN     "formVersion" INTEGER,
ADD COLUMN     "openKey" TEXT,
ADD COLUMN     "resolveDueAt" TIMESTAMP(3),
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "slaEscalatedAt" TIMESTAMP(3),
ADD COLUMN     "slaFirstWarnedAt" TIMESTAMP(3),
ADD COLUMN     "slaResolveWarnedAt" TIMESTAMP(3),
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "unassignedEscalatedAt" TIMESTAMP(3),
ADD COLUMN     "userMessageNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "waitingSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "waitingSince" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TicketCategory" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "confidential" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "departmentId" UUID,
ADD COLUMN     "escalateUnassignedMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "formMode" TEXT NOT NULL DEFAULT 'CHANNEL',
ADD COLUMN     "formVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "TicketPanel" ADD COLUMN     "publishError" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TicketPriority" ADD COLUMN     "firstResponseMinutes" INTEGER,
ADD COLUMN     "resolutionMinutes" INTEGER;

-- AlterTable
ALTER TABLE "TicketStatus" ADD COLUMN     "key" TEXT;

-- AlterTable
ALTER TABLE "TicketTranscript" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "data" JSONB,
ADD COLUMN     "jobKey" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "notify" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DONE',
ADD COLUMN     "text" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "html" SET DEFAULT '',
ALTER COLUMN "sizeBytes" SET DEFAULT 0;

-- Bestehende Transkripte: fortlaufende Versionen je Ticket (älteste = 1), Abschlusszeit = Erstellzeit
UPDATE "TicketTranscript" t SET "version" = v.n, "completedAt" = t."createdAt"
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "ticketId" ORDER BY "createdAt", "id") AS n FROM "TicketTranscript") v
WHERE v."id" = t."id";

-- CreateTable
CREATE TABLE "TicketDepartment" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "emoji" TEXT,
    "staffRoleIds" TEXT[],
    "leadRoleIds" TEXT[],
    "accessRoleNames" TEXT[],
    "notifyChannelId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketFormVersion" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "createdById" UUID,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketFormVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketDraft" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "panelId" UUID,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT NOT NULL,
    "memberRoleIds" TEXT[],
    "formVersion" INTEGER NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "values" JSONB NOT NULL DEFAULT '{}',
    "files" JSONB NOT NULL DEFAULT '{}',
    "ticketId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketDraft_pkey" PRIMARY KEY ("id")
);

-- Bestehende Fragen werden Formular-Version 1 jeder Kategorie (Nachvollziehbarkeit ab jetzt)
INSERT INTO "TicketFormVersion" ("id", "categoryId", "version", "fields", "createdByName")
SELECT gen_random_uuid(), c."id", 1, c."questions", 'Migration' FROM "TicketCategory" c;

-- CreateIndex
CREATE UNIQUE INDEX "TicketDepartment_name_key" ON "TicketDepartment"("name");
CREATE UNIQUE INDEX "TicketFormVersion_categoryId_version_key" ON "TicketFormVersion"("categoryId", "version");
CREATE INDEX "TicketDraft_discordId_idx" ON "TicketDraft"("discordId");
CREATE INDEX "TicketDraft_expiresAt_idx" ON "TicketDraft"("expiresAt");
CREATE UNIQUE INDEX "SupportTicket_openKey_key" ON "SupportTicket"("openKey");
CREATE INDEX "SupportTicket_departmentId_idx" ON "SupportTicket"("departmentId");
CREATE INDEX "SupportTicket_closedAt_idx" ON "SupportTicket"("closedAt");
CREATE UNIQUE INDEX "TicketStatus_key_key" ON "TicketStatus"("key");
CREATE UNIQUE INDEX "TicketTranscript_jobKey_key" ON "TicketTranscript"("jobKey");
CREATE INDEX "TicketTranscript_status_nextAttemptAt_idx" ON "TicketTranscript"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "TicketTranscript_ticketId_version_key" ON "TicketTranscript"("ticketId", "version");

-- Feste Bedeutung bestehender Status (Namen und Schalter bleiben unverändert): erst nach Schalter, dann nach Namen
UPDATE "TicketStatus" SET "key" = 'OPEN' WHERE "id" = (SELECT "id" FROM "TicketStatus" WHERE "isDefault" AND "kind" = 'OPEN' ORDER BY "position" LIMIT 1);
UPDATE "TicketStatus" SET "key" = 'CLOSED' WHERE "id" = (SELECT "id" FROM "TicketStatus" WHERE "isClose" AND "kind" = 'CLOSED' AND "key" IS NULL ORDER BY "position" LIMIT 1);
UPDATE "TicketStatus" SET "key" = 'ESCALATED' WHERE "id" = (SELECT "id" FROM "TicketStatus" WHERE "isEscalation" AND "kind" = 'OPEN' AND "key" IS NULL ORDER BY "position" LIMIT 1);
UPDATE "TicketStatus" SET "key" = 'ARCHIVED' WHERE "id" = (SELECT "id" FROM "TicketStatus" WHERE "kind" = 'ARCHIVED' AND "key" IS NULL ORDER BY "position" LIMIT 1);
UPDATE "TicketStatus" s SET "key" = m."key" FROM (VALUES
  ('übernommen', 'CLAIMED'), ('in bearbeitung', 'IN_PROGRESS'), ('wartet auf benutzer', 'WAITING_USER'), ('wartet auf nutzer', 'WAITING_USER'),
  ('wartet auf team', 'WAITING_INTERNAL'), ('wartet auf interne rückmeldung', 'WAITING_INTERNAL'), ('gelöst', 'RESOLVED')
) AS m("name", "key")
WHERE s."key" IS NULL AND s."kind" = 'OPEN' AND lower(s."name") = m."name"
  AND s."id" = (SELECT x."id" FROM "TicketStatus" x WHERE x."key" IS NULL AND x."kind" = 'OPEN' AND lower(x."name") = m."name" ORDER BY x."position" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "TicketStatus" y WHERE y."key" = m."key");

-- Neue Rechte
INSERT INTO "Permission" ("key", "module") VALUES
  ('ticket.assign', 'ticket'), ('ticket.archive', 'ticket'), ('ticket.change_department', 'ticket'), ('ticket.transcript_export', 'ticket'),
  ('ticket.transcript_manage', 'ticket'), ('ticket.departments', 'ticket'), ('ticket.audit', 'ticket'), ('ticket.bypass_limits', 'ticket')
ON CONFLICT ("key") DO NOTHING;
-- Bestehende Rollen behalten, was sie bisher konnten: Archivieren ging über „Status ändern“, Herunterladen/Erzeugen über „Transkript“,
-- Abteilungswechsel entspricht dem Kategoriewechsel, Abteilungen gehören zur Einrichtung. Neue Fähigkeiten (Zuweisen, Audit, Limits umgehen)
-- bekommen nur Rollen mit ticket.manage bzw. ticket.* – keine Rolle erhält dadurch mehr Zugriff auf Tickets als vorher.
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  ('ticket.change_status', 'ticket.archive'), ('ticket.transcript', 'ticket.transcript_export'), ('ticket.transcript', 'ticket.transcript_manage'),
  ('ticket.change_category', 'ticket.change_department'), ('ticket.settings', 'ticket.departments'),
  ('ticket.manage', 'ticket.assign'), ('ticket.manage', 'ticket.audit'), ('ticket.manage', 'ticket.bypass_limits')
) AS m(base, perm) ON rp."permissionKey" = m.base
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
