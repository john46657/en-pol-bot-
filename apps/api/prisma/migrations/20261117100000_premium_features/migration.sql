-- Premium-Funktionen: Lageassistent, Beamtenlaufbahn, Vorgangsverknüpfung, Qualitätsprüfer, Prüfungszentrum, Einsatzkarte,
-- Personalprognose, technische Überwachung und Backups. Nur ADDITIV: neue Tabellen und Spalten, keine Daten werden gelöscht oder geändert.

-- AlterTable
ALTER TABLE "ErlcEmergencyCall" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "positionSource" TEXT;

-- AlterTable
ALTER TABLE "ErlcServer" ADD COLUMN     "failingSince" TIMESTAMP(3),
ADD COLUMN     "failureCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HrExam" ADD COLUMN     "drawRules" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "HrExamAttempt" ADD COLUMN     "rubricScores" JSONB,
ADD COLUMN     "weakTopics" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CaseFile" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "mergedIntoId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CaseFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseLink" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "role" TEXT,
    "note" TEXT,
    "label" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "addedById" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedById" UUID,
    "removedAt" TIMESTAMP(3),
    "removeReason" TEXT,

    CONSTRAINT "CaseLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseDuplicateDecision" (
    "id" UUID NOT NULL,
    "caseAId" UUID NOT NULL,
    "caseBId" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "decidedById" UUID NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseDuplicateDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityException" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedById" UUID,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "QualityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SituationReport" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "number" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SituationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceName" TEXT,
    "step" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "alertedAt" TIMESTAMP(3),
    "acknowledgedById" UUID,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "kind" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "fileName" TEXT,
    "rows" INTEGER,
    "size" INTEGER,
    "error" TEXT,
    "details" JSONB,
    "createdById" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseFile_number_key" ON "CaseFile"("number");

-- CreateIndex
CREATE INDEX "CaseFile_serverId_idx" ON "CaseFile"("serverId");

-- CreateIndex
CREATE INDEX "CaseFile_status_updatedAt_idx" ON "CaseFile"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "CaseLink_caseId_idx" ON "CaseLink"("caseId");

-- CreateIndex
CREATE INDEX "CaseLink_entityType_entityId_idx" ON "CaseLink"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseDuplicateDecision_caseAId_caseBId_key" ON "CaseDuplicateDecision"("caseAId", "caseBId");

-- CreateIndex
CREATE INDEX "QualityException_targetType_targetId_idx" ON "QualityException"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "QualityException_serverId_idx" ON "QualityException"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "SituationReport_number_key" ON "SituationReport"("number");

-- CreateIndex
CREATE INDEX "SituationReport_serverId_createdAt_idx" ON "SituationReport"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_status_lastAt_idx" ON "IntegrationEvent"("status", "lastAt");

-- CreateIndex
CREATE INDEX "IntegrationEvent_source_sourceId_step_idx" ON "IntegrationEvent"("source", "sourceId", "step");

-- CreateIndex
CREATE INDEX "BackupRun_action_startedAt_idx" ON "BackupRun"("action", "startedAt");

-- CreateIndex
CREATE INDEX "BackupRun_fileName_idx" ON "BackupRun"("fileName");

-- AddForeignKey
ALTER TABLE "CaseLink" ADD CONSTRAINT "CaseLink_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CaseFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Aktiv eindeutig: ein Datensatz höchstens einmal je Vorgang (gelöste Verknüpfungen bleiben als Historie stehen)
CREATE UNIQUE INDEX "CaseLink_active_key" ON "CaseLink"("caseId", "entityType", "entityId") WHERE "removedAt" IS NULL;
-- Aktiv eindeutig: höchstens eine gültige Ausnahme je Datensatz und Prüfregel
CREATE UNIQUE INDEX "QualityException_active_key" ON "QualityException"("targetType", "targetId", "code") WHERE "revokedAt" IS NULL;
-- Höchstens eine offene Störung je Quelle und Schritt (verhindert doppelte Störungsmeldungen bei parallelen Abrufen)
CREATE UNIQUE INDEX "IntegrationEvent_open_key" ON "IntegrationEvent"("source", COALESCE("sourceId", ''), COALESCE("step", '')) WHERE "status" = 'OPEN';

-- Gespeicherte Lageberichte sind Momentaufnahmen: nachträglich nicht änderbar oder löschbar
CREATE OR REPLACE FUNCTION situation_report_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SituationReport ist unveränderlich';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER situation_report_no_update_delete
  BEFORE UPDATE OR DELETE ON "SituationReport"
  FOR EACH ROW EXECUTE FUNCTION situation_report_immutable();
CREATE TRIGGER situation_report_no_truncate
  BEFORE TRUNCATE ON "SituationReport"
  FOR EACH STATEMENT EXECUTE FUNCTION situation_report_immutable();

-- Neue Rechte (Standard: verweigert – nur ausdrücklich vergeben)
INSERT INTO "Permission" ("key", "module") VALUES
  ('situation.view', 'situation'), ('situation.create', 'situation'), ('career.view', 'career'), ('cases.view', 'cases'), ('cases.manage', 'cases'),
  ('quality.view', 'quality'), ('quality.exception', 'quality'), ('quality.manage', 'quality'), ('forecast.view', 'forecast'),
  ('integrations.view', 'integrations'), ('integrations.manage', 'integrations'), ('backups.view', 'backups'), ('backups.manage', 'backups'), ('backups.restore', 'backups')
ON CONFLICT ("key") DO NOTHING;
-- Backups lagen bisher unter settings.manage: wer das hat, behält den Zugang (sonst verlören bestehende Administratoren die Backup-Seite)
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES ('backups.view'), ('backups.manage'), ('backups.restore')) AS m(perm) ON TRUE
WHERE rp."effect" = 'ALLOW' AND rp."permissionKey" IN ('settings.manage', 'settings.*')
ON CONFLICT DO NOTHING;
