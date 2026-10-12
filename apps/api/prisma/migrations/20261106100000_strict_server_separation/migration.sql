-- Server von Grund auf getrennt: bisher gemeinsame Tabellen bekommen einen Bereich je Server (serverId); Eindeutigkeiten gelten je Server.
-- Nicht destruktiv: nur Spalten/Indizes. Bestehende Einträge ordnet die Anwendung beim Start dem Heimat-Server zu (server-links.service.ts);
-- bestehende Server übernehmen einmalig die bisherigen Rollen und Einstellungen als eigene Kopien (servers.service.ts).

-- DropIndex
DROP INDEX "CadMember_discordId_key";
-- DropIndex
DROP INDEX "CadMember_userId_key";
-- DropIndex
DROP INDEX "HrRank_name_key";
-- DropIndex
DROP INDEX "LegalCode_code_key";
-- DropIndex
DROP INDEX "Personnel_callsign_key";
-- DropIndex
DROP INDEX "Personnel_serviceNumber_key";
-- DropIndex
DROP INDEX "Personnel_userId_key";
-- DropIndex
DROP INDEX "RadioWhitelist_userId_key";
-- DropIndex
DROP INDEX "SekMember_userId_key";
-- DropIndex
DROP INDEX "ServiceNumber_display_key";
-- DropIndex
DROP INDEX "Unit_callsign_key";
-- DropIndex
DROP INDEX "UserPermissionOverride_userId_permissionKey_key";
-- AlterTable
ALTER TABLE "AcademyCourse" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "CadMapObject" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "CadMember" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "DiscordServer" ADD COLUMN     "rolesInitializedAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "HireQueue" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "HrAnnouncement" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "HrExam" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "HrPoll" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "HrRank" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "HrRequest" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "HrTraining" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "LegalCode" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "Personnel" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "RadioWhitelist" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "SekMember" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "SekReport" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "ServiceNumber" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "ServiceNumberRange" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "UserPermissionOverride" ADD COLUMN     "guildId" TEXT;
-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "serverId" UUID;
-- CreateIndex
CREATE INDEX "AcademyCourse_serverId_idx" ON "AcademyCourse"("serverId");
-- CreateIndex
CREATE INDEX "CadMapObject_serverId_idx" ON "CadMapObject"("serverId");
-- CreateIndex
CREATE UNIQUE INDEX "CadMember_serverId_userId_key" ON "CadMember"("serverId", "userId");
-- CreateIndex
CREATE UNIQUE INDEX "CadMember_serverId_discordId_key" ON "CadMember"("serverId", "discordId");
-- CreateIndex
CREATE INDEX "Conversation_serverId_idx" ON "Conversation"("serverId");
-- CreateIndex
CREATE INDEX "HireQueue_serverId_idx" ON "HireQueue"("serverId");
-- CreateIndex
CREATE INDEX "HrAnnouncement_serverId_idx" ON "HrAnnouncement"("serverId");
-- CreateIndex
CREATE INDEX "HrExam_serverId_idx" ON "HrExam"("serverId");
-- CreateIndex
CREATE INDEX "HrPoll_serverId_idx" ON "HrPoll"("serverId");
-- CreateIndex
CREATE UNIQUE INDEX "HrRank_serverId_name_key" ON "HrRank"("serverId", "name");
-- CreateIndex
CREATE INDEX "HrRequest_serverId_idx" ON "HrRequest"("serverId");
-- CreateIndex
CREATE INDEX "HrTraining_serverId_idx" ON "HrTraining"("serverId");
-- CreateIndex
CREATE INDEX "Incident_serverId_idx" ON "Incident"("serverId");
-- CreateIndex
CREATE UNIQUE INDEX "LegalCode_serverId_code_key" ON "LegalCode"("serverId", "code");
-- CreateIndex
CREATE UNIQUE INDEX "Personnel_serverId_userId_key" ON "Personnel"("serverId", "userId");
-- CreateIndex
CREATE UNIQUE INDEX "Personnel_serverId_callsign_key" ON "Personnel"("serverId", "callsign");
-- CreateIndex
CREATE UNIQUE INDEX "Personnel_serverId_serviceNumber_key" ON "Personnel"("serverId", "serviceNumber");
-- CreateIndex
CREATE UNIQUE INDEX "RadioWhitelist_serverId_userId_key" ON "RadioWhitelist"("serverId", "userId");
-- CreateIndex
CREATE UNIQUE INDEX "SekMember_serverId_userId_key" ON "SekMember"("serverId", "userId");
-- CreateIndex
CREATE INDEX "SekReport_serverId_idx" ON "SekReport"("serverId");
-- CreateIndex
CREATE UNIQUE INDEX "ServiceNumber_serverId_display_key" ON "ServiceNumber"("serverId", "display");
-- CreateIndex
CREATE INDEX "ServiceNumberRange_serverId_idx" ON "ServiceNumberRange"("serverId");
-- CreateIndex
CREATE INDEX "Ticket_serverId_idx" ON "Ticket"("serverId");
-- CreateIndex
CREATE UNIQUE INDEX "Unit_serverId_callsign_key" ON "Unit"("serverId", "callsign");
-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionOverride_userId_guildId_permissionKey_key" ON "UserPermissionOverride"("userId", "guildId", "permissionKey");
-- CreateIndex
CREATE INDEX "Workflow_serverId_idx" ON "Workflow"("serverId");
-- Einträge ohne Server (gemeinsamer Altbestand) bleiben untereinander eindeutig (NULL zählt im Unique-Index sonst nicht)
CREATE UNIQUE INDEX "Personnel_shared_userId_key" ON "Personnel"("userId") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "Personnel_shared_callsign_key" ON "Personnel"("callsign") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "Personnel_shared_serviceNumber_key" ON "Personnel"("serviceNumber") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "Unit_shared_callsign_key" ON "Unit"("callsign") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "SekMember_shared_userId_key" ON "SekMember"("userId") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "RadioWhitelist_shared_userId_key" ON "RadioWhitelist"("userId") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "CadMember_shared_userId_key" ON "CadMember"("userId") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "CadMember_shared_discordId_key" ON "CadMember"("discordId") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "HrRank_shared_name_key" ON "HrRank"("name") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "ServiceNumber_shared_display_key" ON "ServiceNumber"("display") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "LegalCode_shared_code_key" ON "LegalCode"("code") WHERE "serverId" IS NULL;
CREATE UNIQUE INDEX "UserPermissionOverride_global_key" ON "UserPermissionOverride"("userId", "permissionKey") WHERE "guildId" IS NULL;

-- Bisherige Einzel-Ausnahmen galten überall: jede bestehende Ausnahme (insbesondere Verbote!) bekommt jeder bereits
-- registrierte Server als eigene Kopie – niemand gewinnt durch die Trennung Rechte hinzu.
INSERT INTO "UserPermissionOverride" ("id", "userId", "guildId", "permissionKey", "effect", "reason", "createdById", "createdAt")
SELECT gen_random_uuid(), o."userId", s."guildId", o."permissionKey", o."effect", o."reason", o."createdById", o."createdAt"
FROM "UserPermissionOverride" o CROSS JOIN "DiscordServer" s
WHERE o."guildId" IS NULL AND s."archivedAt" IS NULL
ON CONFLICT DO NOTHING;
