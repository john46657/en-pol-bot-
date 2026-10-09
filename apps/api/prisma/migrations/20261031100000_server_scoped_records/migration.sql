-- Berichte, Fahndungen, Ermittlungen, Beschwerden, Beweismittel und Dienstzeiten je Discord-Server (Akten-Bereich wie bei Personen).
-- Bestehende Einträge ordnet die API beim Start einmalig dem Heimat-Server zu (ServerLinksService.assignLegacyRecords).
-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "Investigation" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "WantedRecord" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "serverId" UUID;
-- AlterTable
ALTER TABLE "DutySession" ADD COLUMN     "serverId" UUID;
-- CreateIndex
CREATE INDEX "Report_serverId_idx" ON "Report"("serverId");
-- CreateIndex
CREATE INDEX "Complaint_serverId_idx" ON "Complaint"("serverId");
-- CreateIndex
CREATE INDEX "Investigation_serverId_idx" ON "Investigation"("serverId");
-- CreateIndex
CREATE INDEX "WantedRecord_serverId_idx" ON "WantedRecord"("serverId");
-- CreateIndex
CREATE INDEX "Evidence_serverId_idx" ON "Evidence"("serverId");
-- CreateIndex
CREATE INDEX "DutySession_serverId_idx" ON "DutySession"("serverId");
