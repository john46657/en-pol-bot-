-- CreateTable
CREATE TABLE "DutyReport" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "templateId" UUID NOT NULL,
    "templateName" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "authorId" UUID NOT NULL,
    "values" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "guildId" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "editedById" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DutyReport_number_key" ON "DutyReport"("number");

-- CreateIndex
CREATE INDEX "DutyReport_templateId_periodStart_idx" ON "DutyReport"("templateId", "periodStart");

-- CreateIndex
CREATE INDEX "DutyReport_authorId_createdAt_idx" ON "DutyReport"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "DutyReport" ADD CONSTRAINT "DutyReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Rechte für Tages-/Wochenberichte
INSERT INTO "Permission" ("key", "module") VALUES
  ('dutyreports.view', 'dutyreports'), ('dutyreports.create', 'dutyreports'), ('dutyreports.view_all', 'dutyreports'),
  ('dutyreports.edit_all', 'dutyreports'), ('dutyreports.review', 'dutyreports'), ('dutyreports.manage', 'dutyreports')
ON CONFLICT ("key") DO NOTHING;
-- bestehende Rollen: ausfüllen wie Berichte erstellen, alle sehen/prüfen wie Berichte prüfen, verwalten wie Einstellungen
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  ('reports.create', 'reports.*', 'dutyreports.view'), ('reports.create', 'reports.*', 'dutyreports.create'),
  ('reports.review', 'reports.*', 'dutyreports.view_all'), ('reports.review', 'reports.*', 'dutyreports.review'),
  ('reports.approve', 'reports.*', 'dutyreports.edit_all'),
  ('settings.manage', 'settings.*', 'dutyreports.manage')
) AS m(base, wildcard, perm) ON rp."permissionKey" IN (m.base, m.wildcard)
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
