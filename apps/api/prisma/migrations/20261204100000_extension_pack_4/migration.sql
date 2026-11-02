-- Erweiterungspaket 4.0: Personalakte 2.0, Qualifikationsregister, Lernmaterial, praktische Prüfungen, Organigramm,
-- Backup-Manifest, Hilfe-Center. Rein additiv: keine Tabelle/Spalte wird entfernt, keine bestehenden Daten verändert.
-- Rückweg (manuell): neue Tabellen droppen, Spalte PersonnelRecord.confidential entfernen, neue Permission-Zeilen löschen.


-- AlterTable
ALTER TABLE "PersonnelRecord" ADD COLUMN     "confidential" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PersonnelRecordRevision" (
    "id" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "category" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "editedById" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonnelRecordRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonnelDocument" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "personnelId" UUID NOT NULL,
    "mediaId" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PERSONNEL',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "archivedById" UUID,
    CONSTRAINT "PersonnelDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationDefinition" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "operational" BOOLEAN NOT NULL DEFAULT true,
    "validDays" INTEGER,
    "autoGrant" BOOLEAN NOT NULL DEFAULT false,
    "trainingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "examIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QualificationDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonnelQualification" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "personnelId" UUID NOT NULL,
    "definitionId" UUID,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "issuedById" UUID,
    "expiresAt" TIMESTAMP(3),
    "note" TEXT,
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "statusChangedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonnelQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrLearningMaterial" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL DEFAULT '',
    "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trainingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualificationDefId" UUID,
    "examId" UUID,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrLearningMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPracticalExam" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tasks" TEXT,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "passPoints" INTEGER NOT NULL,
    "examinerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trainingId" UUID,
    "qualificationDefId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HrPracticalExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPracticalAssessment" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "personnelId" UUID NOT NULL,
    "examinerId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "criteria" JSONB NOT NULL,
    "passPoints" INTEGER NOT NULL,
    "scores" JSONB NOT NULL DEFAULT '{}',
    "total" INTEGER,
    "maxPoints" INTEGER,
    "passed" BOOLEAN,
    "remarks" TEXT,
    "cancelledReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "HrPracticalAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgUnit" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "responsibilities" TEXT,
    "departmentName" TEXT,
    "leaderPersonnelId" UUID,
    "deputyPersonnelId" UUID,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrgUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgAssignment" (
    "id" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "personnelId" UUID NOT NULL,
    "function" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "endedById" UUID,
    CONSTRAINT "OrgAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'DATABASE',
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "verifiedAt" TIMESTAMP(3),
    "verifyMessage" TEXT,
    "rows" INTEGER,
    "migration" TEXT,
    "formatVersion" INTEGER NOT NULL DEFAULT 2,
    "error" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpCategory" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HelpCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "categoryId" UUID,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'ARTICLE',
    "summary" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "mediaIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticleRevision" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "changeNote" TEXT,
    "editedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HelpArticleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonnelRecordRevision_recordId_createdAt_idx" ON "PersonnelRecordRevision"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonnelDocument_personnelId_createdAt_idx" ON "PersonnelDocument"("personnelId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonnelDocument_serverId_idx" ON "PersonnelDocument"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "QualificationDefinition_serverId_name_key" ON "QualificationDefinition"("serverId", "name");

-- CreateIndex
CREATE INDEX "PersonnelQualification_personnelId_status_idx" ON "PersonnelQualification"("personnelId", "status");

-- CreateIndex
CREATE INDEX "PersonnelQualification_definitionId_status_idx" ON "PersonnelQualification"("definitionId", "status");

-- CreateIndex
CREATE INDEX "PersonnelQualification_serverId_idx" ON "PersonnelQualification"("serverId");

-- CreateIndex
CREATE INDEX "HrLearningMaterial_serverId_idx" ON "HrLearningMaterial"("serverId");

-- CreateIndex
CREATE INDEX "HrPracticalExam_serverId_idx" ON "HrPracticalExam"("serverId");

-- CreateIndex
CREATE INDEX "HrPracticalAssessment_examId_status_idx" ON "HrPracticalAssessment"("examId", "status");

-- CreateIndex
CREATE INDEX "HrPracticalAssessment_personnelId_idx" ON "HrPracticalAssessment"("personnelId");

-- CreateIndex
CREATE INDEX "OrgUnit_serverId_parentId_idx" ON "OrgUnit"("serverId", "parentId");

-- CreateIndex
CREATE INDEX "OrgAssignment_unitId_endedAt_idx" ON "OrgAssignment"("unitId", "endedAt");

-- CreateIndex
CREATE INDEX "OrgAssignment_personnelId_endedAt_idx" ON "OrgAssignment"("personnelId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackupRecord_fileName_key" ON "BackupRecord"("fileName");

-- CreateIndex
CREATE INDEX "BackupRecord_createdAt_idx" ON "BackupRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HelpCategory_serverId_name_key" ON "HelpCategory"("serverId", "name");

-- CreateIndex
CREATE INDEX "HelpArticle_status_idx" ON "HelpArticle"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_serverId_slug_key" ON "HelpArticle"("serverId", "slug");

-- CreateIndex
CREATE INDEX "HelpArticleRevision_articleId_version_idx" ON "HelpArticleRevision"("articleId", "version");

-- AddForeignKey
ALTER TABLE "PersonnelRecordRevision" ADD CONSTRAINT "PersonnelRecordRevision_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "PersonnelRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelDocument" ADD CONSTRAINT "PersonnelDocument_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelDocument" ADD CONSTRAINT "PersonnelDocument_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelQualification" ADD CONSTRAINT "PersonnelQualification_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonnelQualification" ADD CONSTRAINT "PersonnelQualification_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "QualificationDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPracticalAssessment" ADD CONSTRAINT "HrPracticalAssessment_examId_fkey" FOREIGN KEY ("examId") REFERENCES "HrPracticalExam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrPracticalAssessment" ADD CONSTRAINT "HrPracticalAssessment_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrgUnit"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_leaderPersonnelId_fkey" FOREIGN KEY ("leaderPersonnelId") REFERENCES "Personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgUnit" ADD CONSTRAINT "OrgUnit_deputyPersonnelId_fkey" FOREIGN KEY ("deputyPersonnelId") REFERENCES "Personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgAssignment" ADD CONSTRAINT "OrgAssignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "OrgUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgAssignment" ADD CONSTRAINT "OrgAssignment_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpArticle" ADD CONSTRAINT "HelpArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HelpCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpArticleRevision" ADD CONSTRAINT "HelpArticleRevision_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "HelpArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Eindeutigkeit auch für den gemeinsamen Bestand (serverId NULL)
CREATE UNIQUE INDEX "QualificationDefinition_shared_name_key" ON "QualificationDefinition"("name") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "HelpCategory_shared_name_key" ON "HelpCategory"("name") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "HelpArticle_shared_slug_key" ON "HelpArticle"("slug") WHERE "serverId" IS NULL;
-- höchstens eine laufende Bewertung je Prüfling und praktischer Prüfung
CREATE UNIQUE INDEX "HrPracticalAssessment_open_key" ON "HrPracticalAssessment"("examId", "personnelId") WHERE "status" = 'OPEN';
-- höchstens eine aktive Zuordnung je Person und Einheit
CREATE UNIQUE INDEX "OrgAssignment_active_key" ON "OrgAssignment"("unitId", "personnelId") WHERE "endedAt" IS NULL;

-- Neue Rechte
INSERT INTO "Permission" ("key", "module") VALUES
  ('personnel.view_unit', 'personnel'), ('personnel.notes_view', 'personnel'), ('personnel.notes_create', 'personnel'),
  ('personnel.notes_confidential', 'personnel'), ('personnel.documents', 'personnel'),
  ('qualification.view', 'qualification'), ('qualification.grant', 'qualification'), ('qualification.revoke', 'qualification'), ('qualification.manage', 'qualification'),
  ('training.materials', 'training'), ('exam.conduct', 'exam'), ('exam.results', 'exam'),
  ('org.view', 'org'), ('org.edit', 'org'), ('org.hierarchy', 'org'),
  ('backup.view', 'backup'), ('backup.create', 'backup'), ('backup.download', 'backup'), ('backup.verify', 'backup'), ('backup.archive', 'backup'), ('backup.restore', 'backup'), ('backup.settings', 'backup'),
  ('help.view', 'help'), ('help.manage', 'help')
ON CONFLICT ("key") DO NOTHING;

-- Bestehende Rechte bleiben wirksam: wer bisher eine Funktion nutzen durfte, behält sie unter dem neuen, feineren Recht.
-- (Backups brauchten settings.manage, Notizen personnel.view_sensitive/personnel.edit, Qualifikationen personnel.edit …)
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  ('settings.manage', 'backup.view'), ('settings.manage', 'backup.create'), ('settings.manage', 'backup.download'), ('settings.manage', 'backup.verify'),
  ('settings.manage', 'backup.archive'), ('settings.manage', 'backup.restore'), ('settings.manage', 'backup.settings'), ('settings.manage', 'help.manage'),
  ('dashboard.view', 'help.view'),
  ('personnel.view_sensitive', 'personnel.notes_view'), ('personnel.view_sensitive', 'personnel.notes_confidential'),
  ('personnel.edit', 'personnel.notes_create'), ('personnel.edit', 'personnel.documents'),
  ('personnel.view', 'qualification.view'), ('personnel.edit', 'qualification.grant'), ('personnel.edit', 'qualification.revoke'),
  ('promotion.manage_settings', 'qualification.manage'),
  ('personnel.view', 'org.view'), ('promotion.manage_settings', 'org.edit'), ('promotion.manage_settings', 'org.hierarchy'),
  ('training.manage', 'training.materials'), ('exam.grade', 'exam.conduct'), ('exam.grade', 'exam.results'), ('exam.manage', 'exam.results')
) AS m(base, perm) ON rp."permissionKey" = m.base
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
-- Sperren (DENY) wirken weiter: eine Sperre des Grundrechts sperrt auch das neue Recht.
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'DENY'
FROM "RolePermission" rp
JOIN (VALUES ('personnel.view_sensitive', 'personnel.notes_view'), ('personnel.view_sensitive', 'personnel.notes_confidential'), ('settings.manage', 'backup.restore')) AS m(base, perm) ON rp."permissionKey" = m.base
WHERE rp."effect" = 'DENY'
ON CONFLICT DO NOTHING;

-- Qualifikationsregister: bestehende Qualifikationen (Namen an der Personalakte) als „Übernommen (Altbestand)“ eintragen.
-- Personnel.qualifications bleibt unverändert erhalten.
INSERT INTO "PersonnelQualification" ("id", "serverId", "personnelId", "name", "status", "source", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."serverId", p."id", q.name, 'ACTIVE', 'LEGACY', NOW(), NOW()
FROM "Personnel" p
CROSS JOIN LATERAL (SELECT DISTINCT btrim(x) AS name FROM unnest(p."qualifications") AS x WHERE btrim(x) <> '') q;
