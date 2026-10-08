-- Personal je Discord-Server (Akten-Bereich wie bei Personen): Personalakten, Ränge, Ausbildungen, Prüfungen, Meldungen, Abstimmungen, Dienstnummern.
-- Eindeutig sind Benutzer, Rufname, Dienstnummer und Rangname jetzt je Bereich statt datenbankweit.
-- Bestehende Einträge ordnet die API beim Start einmalig dem Heimat-Server zu (ServerLinksService.assignLegacyRecords).
-- DropIndex
DROP INDEX "HrRank_name_key";

-- DropIndex
DROP INDEX "Personnel_callsign_key";

-- DropIndex
DROP INDEX "Personnel_serviceNumber_key";

-- DropIndex
DROP INDEX "Personnel_userId_key";

-- DropIndex
DROP INDEX "ServiceNumber_display_key";

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
ALTER TABLE "HrTraining" ADD COLUMN     "serverId" UUID;

-- AlterTable
ALTER TABLE "HrTrainingSession" ADD COLUMN     "serverId" UUID;

-- AlterTable
ALTER TABLE "Personnel" ADD COLUMN     "serverId" UUID;

-- AlterTable
ALTER TABLE "ServiceNumber" ADD COLUMN     "serverId" UUID;

-- AlterTable
ALTER TABLE "ServiceNumberEvent" ADD COLUMN     "serverId" UUID;

-- AlterTable
ALTER TABLE "ServiceNumberRange" ADD COLUMN     "serverId" UUID;

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
CREATE INDEX "HrTraining_serverId_idx" ON "HrTraining"("serverId");

-- CreateIndex
CREATE INDEX "HrTrainingSession_serverId_idx" ON "HrTrainingSession"("serverId");

-- CreateIndex
CREATE INDEX "Personnel_userId_idx" ON "Personnel"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Personnel_serverId_userId_key" ON "Personnel"("serverId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Personnel_serverId_callsign_key" ON "Personnel"("serverId", "callsign");

-- CreateIndex
CREATE UNIQUE INDEX "Personnel_serverId_serviceNumber_key" ON "Personnel"("serverId", "serviceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceNumber_serverId_display_key" ON "ServiceNumber"("serverId", "display");

-- CreateIndex
CREATE INDEX "ServiceNumberEvent_serverId_idx" ON "ServiceNumberEvent"("serverId");

-- CreateIndex
CREATE INDEX "ServiceNumberRange_serverId_idx" ON "ServiceNumberRange"("serverId");

