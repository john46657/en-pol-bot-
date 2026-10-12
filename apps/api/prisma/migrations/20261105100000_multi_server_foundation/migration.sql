-- Multi-Server-Grundlage: Server, Mitgliedschaften, Module je Server, Discord-Rollen-Zuordnung, Verbindungen, Datenfreigaben, Synchronisierung.
-- Nicht destruktiv: es werden nur Spalten/Tabellen/Indizes ergänzt; der globale Unique-Index auf Role.name wird durch (guildId, name) + Teil-Index ersetzt.

-- DropIndex
DROP INDEX "DutyWeekArchive_weekStart_key";

-- DropIndex
DROP INDEX "Role_name_key";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "result" TEXT NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN     "serverId" TEXT;

-- AlterTable
ALTER TABLE "DutyWeekArchive" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'global';

-- AlterTable
ALTER TABLE "UserRole" ADD COLUMN     "guildIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "DiscordServer" (
    "id" UUID NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerMembership" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT NOT NULL DEFAULT 'DISCORD',
    "discordRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppModule" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "dependsOn" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "AppModule_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ServerModuleSetting" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerModuleSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordRoleMapping" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordRoleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerConnection" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerConnectionMember" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerConnectionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionDataPolicy" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "sourceServerId" UUID NOT NULL,
    "targetServerId" UUID NOT NULL,
    "dataType" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'A_TO_B',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionDataPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "sourceServerId" UUID NOT NULL,
    "targetServerId" UUID NOT NULL,
    "dataType" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncedRecord" (
    "id" UUID NOT NULL,
    "targetServerId" UUID NOT NULL,
    "sourceServerId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "dataType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordServer_guildId_key" ON "DiscordServer"("guildId");

-- CreateIndex
CREATE INDEX "ServerMembership_userId_idx" ON "ServerMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerMembership_serverId_userId_key" ON "ServerMembership"("serverId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerModuleSetting_serverId_moduleKey_key" ON "ServerModuleSetting"("serverId", "moduleKey");

-- CreateIndex
CREATE INDEX "DiscordRoleMapping_roleId_idx" ON "DiscordRoleMapping"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordRoleMapping_serverId_discordRoleId_roleId_key" ON "DiscordRoleMapping"("serverId", "discordRoleId", "roleId");

-- CreateIndex
CREATE INDEX "ServerConnectionMember_serverId_idx" ON "ServerConnectionMember"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerConnectionMember_connectionId_serverId_key" ON "ServerConnectionMember"("connectionId", "serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionDataPolicy_connectionId_sourceServerId_targetServ_key" ON "ConnectionDataPolicy"("connectionId", "sourceServerId", "targetServerId", "dataType");

-- CreateIndex
CREATE UNIQUE INDEX "SyncEvent_idempotencyKey_key" ON "SyncEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SyncEvent_status_nextAttemptAt_idx" ON "SyncEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "SyncEvent_connectionId_createdAt_idx" ON "SyncEvent"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncedRecord_targetServerId_dataType_updatedAt_idx" ON "SyncedRecord"("targetServerId", "dataType", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedRecord_targetServerId_dataType_sourceRecordId_key" ON "SyncedRecord"("targetServerId", "dataType", "sourceRecordId");

-- CreateIndex
CREATE INDEX "AuditLog_serverId_createdAt_idx" ON "AuditLog"("serverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DutyWeekArchive_scope_weekStart_key" ON "DutyWeekArchive"("scope", "weekStart");

-- CreateIndex
CREATE INDEX "Role_name_idx" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_guildId_name_key" ON "Role"("guildId", "name");

-- AddForeignKey
ALTER TABLE "ServerMembership" ADD CONSTRAINT "ServerMembership_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerMembership" ADD CONSTRAINT "ServerMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerModuleSetting" ADD CONSTRAINT "ServerModuleSetting_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerModuleSetting" ADD CONSTRAINT "ServerModuleSetting_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "AppModule"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordRoleMapping" ADD CONSTRAINT "DiscordRoleMapping_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordRoleMapping" ADD CONSTRAINT "DiscordRoleMapping_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerConnectionMember" ADD CONSTRAINT "ServerConnectionMember_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ServerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerConnectionMember" ADD CONSTRAINT "ServerConnectionMember_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionDataPolicy" ADD CONSTRAINT "ConnectionDataPolicy_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ServerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ServerConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Serverübergreifende Rollen (guildId NULL) bleiben namentlich eindeutig (NULL zählt im Unique-Index sonst nicht).
CREATE UNIQUE INDEX "Role_global_name_key" ON "Role"("name") WHERE "guildId" IS NULL;

-- Freigaben nur zwischen Mitgliedern DERSELBEN Verbindung (zusammengesetzte Fremdschlüssel), nie Server mit sich selbst.
ALTER TABLE "ConnectionDataPolicy" ADD CONSTRAINT "ConnectionDataPolicy_source_member_fkey" FOREIGN KEY ("connectionId", "sourceServerId") REFERENCES "ServerConnectionMember"("connectionId", "serverId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionDataPolicy" ADD CONSTRAINT "ConnectionDataPolicy_target_member_fkey" FOREIGN KEY ("connectionId", "targetServerId") REFERENCES "ServerConnectionMember"("connectionId", "serverId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectionDataPolicy" ADD CONSTRAINT "ConnectionDataPolicy_distinct_servers" CHECK ("sourceServerId" <> "targetServerId");
ALTER TABLE "ConnectionDataPolicy" ADD CONSTRAINT "ConnectionDataPolicy_direction_check" CHECK ("direction" IN ('A_TO_B', 'B_TO_A', 'BIDIRECTIONAL', 'NONE'));
ALTER TABLE "DiscordServer" ADD CONSTRAINT "DiscordServer_status_check" CHECK ("status" IN ('ACTIVE', 'DISABLED', 'ERROR'));
ALTER TABLE "ServerMembership" ADD CONSTRAINT "ServerMembership_status_check" CHECK ("status" IN ('MEMBER', 'LEFT', 'UNKNOWN'));
ALTER TABLE "ServerConnection" ADD CONSTRAINT "ServerConnection_status_check" CHECK ("status" IN ('ACTIVE', 'DISABLED'));
ALTER TABLE "SyncEvent" ADD CONSTRAINT "SyncEvent_status_check" CHECK ("status" IN ('PENDING', 'DONE', 'SKIPPED', 'FAILED', 'CANCELLED'));
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_result_check" CHECK ("result" IN ('SUCCESS', 'DENIED', 'FAILED'));

-- Bereits bekannte Server (vom Bot gemeldet) registrieren – ohne Daten zu verschieben oder freizugeben.
INSERT INTO "DiscordServer" ("id", "guildId", "name", "status", "updatedAt")
SELECT gen_random_uuid(), g->>'id', COALESCE(NULLIF(g->>'name', ''), g->>'id'), 'ACTIVE', CURRENT_TIMESTAMP
FROM "SystemSetting" s, jsonb_array_elements(CASE WHEN jsonb_typeof(s."value") = 'array' THEN s."value" ELSE '[]'::jsonb END) g
WHERE s."key" = 'discord.guilds' AND (g->>'id') ~ '^\d{15,25}$'
ON CONFLICT ("guildId") DO NOTHING;

-- Neue Rechte (Systemadministrator hat „*“; andere Rollen bekommen sie nur ausdrücklich)
INSERT INTO "Permission" ("key", "module") VALUES
  ('servers.view', 'servers'), ('servers.manage', 'servers'), ('modules.view', 'modules'), ('modules.manage', 'modules'),
  ('connections.view', 'connections'), ('connections.manage', 'connections'), ('sync.view', 'sync'), ('sync.retry', 'sync')
ON CONFLICT ("key") DO NOTHING;
