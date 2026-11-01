-- Verwaltung 3.0: Schichtplanung, Kalender, Besprechungen, Ankündigungen, Dokumente, zentrale Benachrichtigungen,
-- Rückfragen bei Personalanträgen, Prüfer bei Abmeldungen. Rein additiv: keine Tabelle/Spalte wird gelöscht oder umbenannt,
-- bestehende Daten bleiben unverändert (neue Spalten haben Standardwerte bzw. sind optional).

-- AlterTable
ALTER TABLE "HrRequest" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "queries" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "reviewerId" UUID;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "reviewStartedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" UUID;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "event" TEXT,
ADD COLUMN     "important" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "link" TEXT;

-- CreateTable
CREATE TABLE "PlannedShift" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin',
    "department" TEXT,
    "description" TEXT,
    "leaderId" UUID,
    "unit" TEXT,
    "minStaff" INTEGER NOT NULL DEFAULT 1,
    "maxStaff" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "cancelReason" TEXT,
    "seriesId" UUID,
    "createdById" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "department" TEXT,
    "organizerId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "cancelReason" TEXT,
    "reminders" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "maxParticipants" INTEGER,
    "openSignup" BOOLEAN NOT NULL DEFAULT true,
    "seriesId" UUID,
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarParticipant" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarReminderLog" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "minutesBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipients" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CalendarReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "eventId" UUID NOT NULL,
    "discordChannelId" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "agenda" TEXT,
    "notes" TEXT,
    "decisions" TEXT,
    "followUp" TEXT,
    "conductedAt" TIMESTAMP(3),
    "minutesById" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingTask" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" UUID,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "channelId" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'SERVER',
    "audienceRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audienceDepartments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mentionRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "recurrence" TEXT NOT NULL DEFAULT 'NONE',
    "publishedAt" TIMESTAMP(3),
    "retractedAt" TIMESTAMP(3),
    "retractReason" TEXT,
    "templateName" TEXT,
    "createdById" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementDelivery" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "stateKey" TEXT NOT NULL,
    "actorId" UUID,
    "slot" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "access" TEXT NOT NULL DEFAULT 'ALL',
    "roleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "mediaId" UUID NOT NULL,
    "note" TEXT,
    "restoredFrom" INTEGER,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannedShift_serverId_startsAt_idx" ON "PlannedShift"("serverId", "startsAt");

-- CreateIndex
CREATE INDEX "PlannedShift_status_startsAt_idx" ON "PlannedShift"("status", "startsAt");

-- CreateIndex
CREATE INDEX "PlannedShift_seriesId_idx" ON "PlannedShift"("seriesId");

-- CreateIndex
CREATE INDEX "ShiftAssignment_userId_status_idx" ON "ShiftAssignment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_shiftId_userId_key" ON "ShiftAssignment"("shiftId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_idempotencyKey_key" ON "CalendarEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CalendarEvent_serverId_startsAt_idx" ON "CalendarEvent"("serverId", "startsAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_status_startsAt_idx" ON "CalendarEvent"("status", "startsAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_seriesId_idx" ON "CalendarEvent"("seriesId");

-- CreateIndex
CREATE INDEX "CalendarParticipant_userId_status_idx" ON "CalendarParticipant"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarParticipant_eventId_userId_key" ON "CalendarParticipant"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarReminderLog_eventId_minutesBefore_key" ON "CalendarReminderLog"("eventId", "minutesBefore");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_eventId_key" ON "Meeting"("eventId");

-- CreateIndex
CREATE INDEX "Meeting_serverId_idx" ON "Meeting"("serverId");

-- CreateIndex
CREATE INDEX "MeetingTask_assigneeId_status_idx" ON "MeetingTask"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "Announcement_serverId_status_idx" ON "Announcement"("serverId", "status");

-- CreateIndex
CREATE INDEX "Announcement_status_scheduledAt_idx" ON "Announcement"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AnnouncementDelivery_announcementId_createdAt_idx" ON "AnnouncementDelivery"("announcementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDelivery_announcementId_kind_slot_key" ON "AnnouncementDelivery"("announcementId", "kind", "slot");

-- CreateIndex
CREATE INDEX "Document_serverId_status_category_idx" ON "Document"("serverId", "status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_number_key" ON "DocumentVersion"("documentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PlannedShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarParticipant" ADD CONSTRAINT "CalendarParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarReminderLog" ADD CONSTRAINT "CalendarReminderLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTask" ADD CONSTRAINT "MeetingTask_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementDelivery" ADD CONSTRAINT "AnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Neue Rechte registrieren (der Seed tut das beim Start ebenfalls – hier nötig, damit die Zuweisungen unten gültig sind)
INSERT INTO "Permission" ("key", "module") VALUES
  ('promotion.request', 'promotion'), ('transfer.request', 'transfer'), ('transfer.review', 'transfer'),
  ('analytics.leaderboard', 'analytics'), ('analytics.personal_all', 'analytics'), ('analytics.export', 'analytics'),
  ('shiftplan.view', 'shiftplan'), ('shiftplan.signup', 'shiftplan'), ('shiftplan.manage', 'shiftplan'),
  ('calendar.view', 'calendar'), ('calendar.manage', 'calendar'),
  ('meetings.view', 'meetings'), ('meetings.organize', 'meetings'), ('meetings.minutes', 'meetings'), ('meetings.view_private', 'meetings'),
  ('announce.view', 'announce'), ('announce.create', 'announce'), ('announce.publish', 'announce'), ('announce.mention', 'announce'), ('announce.manage', 'announce'),
  ('documents.view', 'documents'), ('documents.upload', 'documents'), ('documents.manage', 'documents'), ('documents.confidential', 'documents'),
  ('notifications.manage', 'notifications')
ON CONFLICT ("key") DO NOTHING;

-- Bestehende Rollen bekommen die neuen Rechte passend zu dem, was sie schon dürfen (nur ALLOW-Zuweisungen als Grundlage;
-- vorhandene Einträge – auch DENY – bleiben unangetastet).
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  -- alle Mitglieder (wer Abmeldungen beantragen darf)
  ('leave.request', 'shiftplan.view'), ('leave.request', 'shiftplan.signup'), ('leave.request', 'calendar.view'), ('leave.request', 'meetings.view'),
  ('leave.request', 'documents.view'), ('leave.request', 'promotion.request'), ('leave.request', 'transfer.request'),
  -- Schichtleitung
  ('team.manage', 'shiftplan.manage'), ('team.manage', 'calendar.manage'), ('team.manage', 'meetings.organize'), ('team.manage', 'meetings.minutes'), ('team.manage', 'analytics.leaderboard'),
  -- Personalführung
  ('transfer.approve', 'transfer.review'), ('personnel.view_sensitive', 'meetings.view_private'), ('personnel.view_sensitive', 'documents.confidential'),
  ('personnel.view', 'analytics.personal_all'), ('analytics.view', 'analytics.leaderboard'), ('analytics.view', 'analytics.export'),
  -- Ankündigungen: wer schon über den Bot Nachrichten senden darf
  ('messagebuilder.send', 'announce.view'), ('messagebuilder.send', 'announce.create'), ('messagebuilder.send', 'announce.publish'),
  -- Verwaltung
  ('settings.manage', 'announce.view'), ('settings.manage', 'announce.create'), ('settings.manage', 'announce.publish'), ('settings.manage', 'announce.mention'), ('settings.manage', 'announce.manage'),
  ('settings.manage', 'documents.upload'), ('settings.manage', 'documents.manage'), ('settings.manage', 'notifications.manage'),
  ('training.manage', 'documents.upload'), ('training.manage', 'calendar.manage')
) AS m(base, perm) ON rp."permissionKey" = m.base
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
