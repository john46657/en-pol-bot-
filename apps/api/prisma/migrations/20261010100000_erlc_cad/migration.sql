-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "guildId" TEXT,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "involved" TEXT,
ADD COLUMN     "keyword" TEXT,
ADD COLUMN     "mapX" DOUBLE PRECISION,
ADD COLUMN     "mapZ" DOUBLE PRECISION,
ADD COLUMN     "requiredUnits" TEXT,
ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "color" TEXT,
ADD COLUMN     "discordRoleId" TEXT,
ADD COLUMN     "erlcTeam" TEXT,
ADD COLUMN     "guildId" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "mapX" DOUBLE PRECISION,
ADD COLUMN     "mapZ" DOUBLE PRECISION,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "operational" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "type" TEXT;

-- CreateTable
CREATE TABLE "ErlcServer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "serverRef" TEXT,
    "description" TEXT,
    "logoUrl" TEXT,
    "guildId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "keyCipher" TEXT NOT NULL,
    "pollSeconds" INTEGER NOT NULL DEFAULT 15,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "latencyMs" INTEGER,
    "rateLimit" JSONB,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErlcServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErlcEmergencyCall" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "callNumber" INTEGER NOT NULL,
    "team" TEXT,
    "callerRobloxId" TEXT,
    "callerName" TEXT,
    "description" TEXT,
    "positionDescriptor" TEXT,
    "mapX" DOUBLE PRECISION,
    "mapZ" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "claimedById" UUID,
    "incidentId" UUID,
    "source" TEXT NOT NULL DEFAULT 'API',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErlcEmergencyCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErlcCommandLog" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "userId" UUID,
    "discordId" TEXT,
    "command" TEXT NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "ok" BOOLEAN NOT NULL,
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErlcCommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadMapObject" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "layer" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "x" DOUBLE PRECISION,
    "z" DOUBLE PRECISION,
    "points" JSONB,
    "roleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "incidentType" TEXT,
    "autoAction" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CadMapObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadIncidentLog" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "unitId" UUID,
    "authorId" UUID,
    "guildId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadIncidentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadRadioMessage" (
    "id" UUID NOT NULL,
    "callsign" TEXT,
    "unitId" UUID,
    "incidentId" UUID,
    "text" TEXT NOT NULL,
    "authorId" UUID,
    "discordId" TEXT,
    "guildId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadRadioMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadMember" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "discordId" TEXT,
    "discordName" TEXT,
    "robloxName" TEXT,
    "robloxId" TEXT,
    "erlcName" TEXT,
    "team" TEXT,
    "unitId" UUID,
    "zelloName" TEXT,
    "callsign" TEXT,
    "department" TEXT,
    "rank" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CadMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadServerLink" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sourceGuildId" TEXT NOT NULL,
    "targetGuildId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sendTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowActions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "roleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channels" JSONB,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CadServerLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErlcEmergencyCall_status_startedAt_idx" ON "ErlcEmergencyCall"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErlcEmergencyCall_serverId_callNumber_startedAt_key" ON "ErlcEmergencyCall"("serverId", "callNumber", "startedAt");

-- CreateIndex
CREATE INDEX "ErlcCommandLog_serverId_createdAt_idx" ON "ErlcCommandLog"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "CadMapObject_layer_idx" ON "CadMapObject"("layer");

-- CreateIndex
CREATE INDEX "CadIncidentLog_incidentId_createdAt_idx" ON "CadIncidentLog"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "CadRadioMessage_createdAt_idx" ON "CadRadioMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CadMember_userId_key" ON "CadMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CadMember_discordId_key" ON "CadMember"("discordId");

-- CreateIndex
CREATE INDEX "CadMember_erlcName_idx" ON "CadMember"("erlcName");

-- CreateIndex
CREATE UNIQUE INDEX "CadServerLink_sourceGuildId_targetGuildId_key" ON "CadServerLink"("sourceGuildId", "targetGuildId");

-- AddForeignKey
ALTER TABLE "ErlcEmergencyCall" ADD CONSTRAINT "ErlcEmergencyCall_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ErlcServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErlcCommandLog" ADD CONSTRAINT "ErlcCommandLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ErlcServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CadIncidentLog" ADD CONSTRAINT "CadIncidentLog_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CAD- und ER:LC-Rechte (deny-by-default) + Bereich „CAD“
INSERT INTO "Permission" ("key", "module") VALUES
  ('cad.view', 'cad'), ('cad.create_incident', 'cad'), ('cad.edit_incident', 'cad'), ('cad.close_incident', 'cad'), ('cad.assign_unit', 'cad'),
  ('cad.manage_units', 'cad'), ('cad.view_persons', 'cad'), ('cad.view_vehicles', 'cad'), ('cad.manage_map', 'cad'), ('cad.view_erlc', 'cad'),
  ('cad.manage_erlc', 'cad'), ('cad.erlc_command', 'cad'), ('cad.erlc_command_critical', 'cad'), ('cad.manage_cross_server', 'cad'),
  ('cad.view_logs', 'cad'), ('cad.manage_settings', 'cad'), ('cad.radio', 'cad'), ('dashboard.cad.view', 'dashboard')
ON CONFLICT ("key") DO NOTHING;
-- bestehende Rollen: wer die Leitstelle sieht, sieht das CAD und darf funken; Leitstellen-Rechte → CAD-Einsatzrechte;
-- Einstellungen verwalten → CAD-/ER:LC-Verwaltung. Kritische ER:LC-Befehle bekommt niemand automatisch (nur „*“).
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  ('dispatch.view', 'dispatch.*', 'cad.view'), ('dispatch.view', 'dispatch.*', 'cad.radio'), ('dispatch.view', 'dispatch.*', 'dashboard.cad.view'),
  ('dispatch.create', 'dispatch.*', 'cad.create_incident'), ('dispatch.edit', 'dispatch.*', 'cad.edit_incident'), ('dispatch.close', 'dispatch.*', 'cad.close_incident'),
  ('dispatch.assign', 'dispatch.*', 'cad.assign_unit'), ('dispatch.manage', 'dispatch.*', 'cad.manage_units'), ('dispatch.manage', 'dispatch.*', 'cad.view_erlc'),
  ('persons.view', 'persons.*', 'cad.view_persons'), ('vehicles.view', 'vehicles.*', 'cad.view_vehicles'),
  ('settings.manage', 'settings.*', 'cad.manage_settings'), ('settings.manage', 'settings.*', 'cad.manage_map'), ('settings.manage', 'settings.*', 'cad.manage_erlc'),
  ('settings.manage', 'settings.*', 'cad.manage_cross_server'), ('settings.manage', 'settings.*', 'cad.view_logs'), ('settings.manage', 'settings.*', 'cad.erlc_command'),
  ('settings.manage', 'settings.*', 'cad.view_erlc')
) AS m(base, wildcard, perm) ON rp."permissionKey" IN (m.base, m.wildcard)
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
