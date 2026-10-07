-- AlterTable
ALTER TABLE "Personnel" ADD COLUMN     "customChecks" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "rankSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PersonnelRecord" ADD COLUMN     "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "data" JSONB,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "comment" TEXT,
ADD COLUMN     "type" TEXT;

-- CreateTable
CREATE TABLE "HrRank" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "discordRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dashboardRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextRankIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approverRankIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrRank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrRequest" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "personnelId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "achievements" TEXT,
    "internalNote" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requesterId" UUID NOT NULL,
    "approvals" JSONB NOT NULL DEFAULT '[]',
    "decidedAt" TIMESTAMP(3),
    "executedById" UUID,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "HrRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrTraining" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requirements" TEXT,
    "instructorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duration" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "examRequired" BOOLEAN NOT NULL DEFAULT false,
    "examId" UUID,
    "certificate" BOOLEAN NOT NULL DEFAULT true,
    "audience" TEXT,
    "requiredRoleId" TEXT,
    "validDays" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrTraining_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrTrainingProgress" (
    "id" UUID NOT NULL,
    "trainingId" UUID NOT NULL,
    "personnelId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "examinerId" UUID,
    "note" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "certificateNo" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrTrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrExam" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "passPercent" INTEGER NOT NULL DEFAULT 70,
    "timeLimitMin" INTEGER,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "retryHours" INTEGER NOT NULL DEFAULT 24,
    "autoGrade" BOOLEAN NOT NULL DEFAULT true,
    "showResult" BOOLEAN NOT NULL DEFAULT true,
    "examinerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trainingId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrExamAttempt" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "personnelId" UUID NOT NULL,
    "questionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answers" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "passed" BOOLEAN,
    "gradedById" UUID,
    "gradedAt" TIMESTAMP(3),
    "feedback" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "HrExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrAnnouncement" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "audienceRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "requireAck" BOOLEAN NOT NULL DEFAULT false,
    "discordChannelId" TEXT,
    "attachments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrAnnouncementRead" (
    "announcementId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrAnnouncementRead_pkey" PRIMARY KEY ("announcementId","userId")
);

-- CreateTable
CREATE TABLE "HrPoll" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "options" JSONB NOT NULL,
    "audienceRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "showResults" TEXT NOT NULL DEFAULT 'AFTER_VOTE',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPollVote" (
    "pollId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "optionIds" TEXT[],
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrPollVote_pkey" PRIMARY KEY ("pollId","userId")
);

-- CreateTable
CREATE TABLE "ServiceNumberRange" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "padLength" INTEGER NOT NULL DEFAULT 0,
    "order" TEXT NOT NULL DEFAULT 'LOWEST_FREE',
    "autoAssign" BOOLEAN NOT NULL DEFAULT true,
    "manual" BOOLEAN NOT NULL DEFAULT true,
    "reuse" BOOLEAN NOT NULL DEFAULT true,
    "releaseAs" TEXT NOT NULL DEFAULT 'FORMER',
    "department" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNumberRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceNumber" (
    "id" UUID NOT NULL,
    "rangeId" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "display" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FREE',
    "userId" UUID,
    "personnelId" UUID,
    "reservedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceNumberEvent" (
    "id" UUID NOT NULL,
    "display" TEXT NOT NULL,
    "oldDisplay" TEXT,
    "userId" UUID,
    "personnelId" UUID,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" UUID,
    "approverId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceNumberEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HireQueue" (
    "id" UUID NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "discordId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HireQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HrRank_name_key" ON "HrRank"("name");

-- CreateIndex
CREATE UNIQUE INDEX "HrRequest_number_key" ON "HrRequest"("number");

-- CreateIndex
CREATE INDEX "HrRequest_kind_status_idx" ON "HrRequest"("kind", "status");

-- CreateIndex
CREATE INDEX "HrRequest_personnelId_idx" ON "HrRequest"("personnelId");

-- CreateIndex
CREATE UNIQUE INDEX "HrTrainingProgress_certificateNo_key" ON "HrTrainingProgress"("certificateNo");

-- CreateIndex
CREATE UNIQUE INDEX "HrTrainingProgress_trainingId_personnelId_key" ON "HrTrainingProgress"("trainingId", "personnelId");

-- CreateIndex
CREATE INDEX "HrExamAttempt_examId_personnelId_idx" ON "HrExamAttempt"("examId", "personnelId");

-- CreateIndex
CREATE INDEX "HrAnnouncement_publishAt_idx" ON "HrAnnouncement"("publishAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceNumber_display_key" ON "ServiceNumber"("display");

-- CreateIndex
CREATE INDEX "ServiceNumber_status_idx" ON "ServiceNumber"("status");

-- CreateIndex
CREATE INDEX "ServiceNumber_userId_idx" ON "ServiceNumber"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceNumber_rangeId_value_key" ON "ServiceNumber"("rangeId", "value");

-- CreateIndex
CREATE INDEX "ServiceNumberEvent_display_createdAt_idx" ON "ServiceNumberEvent"("display", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceNumberEvent_personnelId_createdAt_idx" ON "ServiceNumberEvent"("personnelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HireQueue_applicationId_key" ON "HireQueue"("applicationId");

-- CreateIndex
CREATE INDEX "PersonnelRecord_type_createdAt_idx" ON "PersonnelRecord"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "HrRequest" ADD CONSTRAINT "HrRequest_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrTrainingProgress" ADD CONSTRAINT "HrTrainingProgress_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "HrTraining"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrTrainingProgress" ADD CONSTRAINT "HrTrainingProgress_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrExamAttempt" ADD CONSTRAINT "HrExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "HrExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrExamAttempt" ADD CONSTRAINT "HrExamAttempt_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrAnnouncementRead" ADD CONSTRAINT "HrAnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "HrAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPollVote" ADD CONSTRAINT "HrPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "HrPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceNumber" ADD CONSTRAINT "ServiceNumber_rangeId_fkey" FOREIGN KEY ("rangeId") REFERENCES "ServiceNumberRange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ───── Daten übernehmen ─────
-- Mindestzeit im Rang: bisher unbekannt → ab Eintritt
UPDATE "Personnel" SET "rankSince" = "joinDate";
-- vorhandene Dienstgrade (Einstellungen → Teamstruktur, Reihenfolge) und in Akten benutzte Ränge als Ränge anlegen
INSERT INTO "HrRank" ("id", "name", "position", "updatedAt")
SELECT gen_random_uuid(), r.name, r.pos, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (lower(t.name)) t.name, t.pos FROM (
    SELECT e.value AS name, e.ord::int AS pos
    FROM "SystemSetting" s, jsonb_array_elements_text(CASE WHEN jsonb_typeof(s."value") = 'array' THEN s."value" ELSE '[]'::jsonb END) WITH ORDINALITY AS e(value, ord)
    WHERE s."key" = 'team.rankOrder'
    UNION ALL
    SELECT DISTINCT p."rank", 1000 FROM "Personnel" p WHERE p."rank" IS NOT NULL AND trim(p."rank") <> ''
  ) t WHERE trim(t.name) <> '' ORDER BY lower(t.name), t.pos
) r
ON CONFLICT ("name") DO NOTHING;

-- ───── Rechte ─────
INSERT INTO "Permission" ("key", "module") VALUES
  ('personnel.view_sensitive', 'personnel'), ('personnel.delete', 'personnel'),
  ('promotion.view', 'promotion'), ('promotion.create', 'promotion'), ('promotion.edit', 'promotion'), ('promotion.review', 'promotion'), ('promotion.approve', 'promotion'),
  ('promotion.reject', 'promotion'), ('promotion.execute', 'promotion'), ('promotion.manage_ranks', 'promotion'), ('promotion.manage_requirements', 'promotion'),
  ('promotion.view_history', 'promotion'), ('promotion.manage_settings', 'promotion'), ('promotion.manage', 'promotion'),
  ('transfer.view', 'transfer'), ('transfer.create', 'transfer'), ('transfer.approve', 'transfer'), ('transfer.reject', 'transfer'),
  ('training.view', 'training'), ('training.create', 'training'), ('training.manage', 'training'),
  ('exam.view', 'exam'), ('exam.create', 'exam'), ('exam.manage', 'exam'), ('exam.grade', 'exam'),
  ('warning.view', 'warning'), ('warning.create', 'warning'), ('warning.manage', 'warning'),
  ('awards.view', 'awards'), ('awards.create', 'awards'), ('awards.manage', 'awards'),
  ('announcements.view', 'announcements'), ('announcements.create', 'announcements'), ('announcements.manage', 'announcements'),
  ('polls.view', 'polls'), ('polls.create', 'polls'), ('polls.manage', 'polls'),
  ('dienstnummer.view', 'dienstnummer'), ('dienstnummer.create', 'dienstnummer'), ('dienstnummer.assign', 'dienstnummer'), ('dienstnummer.edit', 'dienstnummer'),
  ('dienstnummer.release', 'dienstnummer'), ('dienstnummer.block', 'dienstnummer'), ('dienstnummer.history', 'dienstnummer'), ('dienstnummer.manage_ranges', 'dienstnummer'),
  ('dienstnummer.manage_settings', 'dienstnummer'), ('applications.auto_assign_dienstnummer', 'applications')
ON CONFLICT ("key") DO NOTHING;

-- bestehende Rollen: aus den bisherigen Rechten ableiten (jederzeit unter Rollen & Rechte änderbar)
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  -- alle im Dashboard: Meldungen lesen, abstimmen, eigene Prüfungen
  ('dashboard.view', 'dashboard.*', 'announcements.view'), ('dashboard.view', 'dashboard.*', 'polls.view'), ('dashboard.view', 'dashboard.*', 'exam.view'),
  -- Personal sehen
  ('personnel.view', 'personnel.*', 'promotion.view'), ('personnel.view', 'personnel.*', 'transfer.view'), ('personnel.view', 'personnel.*', 'training.view'),
  ('personnel.view', 'personnel.*', 'awards.view'), ('personnel.view', 'personnel.*', 'dienstnummer.view'),
  -- Personal bearbeiten/anlegen
  ('personnel.edit', 'personnel.*', 'personnel.view_sensitive'), ('personnel.edit', 'personnel.*', 'promotion.view_history'), ('personnel.edit', 'personnel.*', 'dienstnummer.history'),
  ('personnel.create', 'personnel.*', 'promotion.create'), ('personnel.create', 'personnel.*', 'transfer.create'), ('personnel.create', 'personnel.*', 'dienstnummer.assign'),
  -- befördern
  ('personnel.promote', 'personnel.*', 'promotion.edit'), ('personnel.promote', 'personnel.*', 'promotion.review'), ('personnel.promote', 'personnel.*', 'promotion.approve'),
  ('personnel.promote', 'personnel.*', 'promotion.reject'), ('personnel.promote', 'personnel.*', 'promotion.execute'), ('personnel.promote', 'personnel.*', 'transfer.approve'),
  ('personnel.promote', 'personnel.*', 'transfer.reject'), ('personnel.promote', 'personnel.*', 'awards.create'),
  -- Disziplin
  ('personnel.discipline', 'personnel.*', 'warning.view'), ('personnel.discipline', 'personnel.*', 'warning.create'), ('personnel.discipline', 'personnel.*', 'warning.manage'),
  -- Akademie → Ausbildungen/Prüfungen
  ('academy.manage', 'academy.*', 'training.create'), ('academy.manage', 'academy.*', 'training.manage'), ('academy.manage', 'academy.*', 'exam.create'),
  ('academy.manage', 'academy.*', 'exam.manage'), ('academy.manage', 'academy.*', 'exam.grade'),
  -- Bewerbungen entscheiden → Dienstnummer automatisch
  ('applications.decide', 'applications.*', 'applications.auto_assign_dienstnummer'),
  -- Einstellungen verwalten → Konfiguration
  ('settings.manage', 'settings.*', 'promotion.manage_ranks'), ('settings.manage', 'settings.*', 'promotion.manage_requirements'), ('settings.manage', 'settings.*', 'promotion.manage_settings'),
  ('settings.manage', 'settings.*', 'promotion.manage'), ('settings.manage', 'settings.*', 'awards.manage'), ('settings.manage', 'settings.*', 'announcements.create'),
  ('settings.manage', 'settings.*', 'announcements.manage'), ('settings.manage', 'settings.*', 'polls.create'), ('settings.manage', 'settings.*', 'polls.manage'),
  ('settings.manage', 'settings.*', 'dienstnummer.create'), ('settings.manage', 'settings.*', 'dienstnummer.edit'), ('settings.manage', 'settings.*', 'dienstnummer.release'),
  ('settings.manage', 'settings.*', 'dienstnummer.block'), ('settings.manage', 'settings.*', 'dienstnummer.manage_ranges'), ('settings.manage', 'settings.*', 'dienstnummer.manage_settings'),
  ('settings.manage', 'settings.*', 'personnel.delete')
) AS m(base, wildcard, perm) ON rp."permissionKey" IN (m.base, m.wildcard)
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
