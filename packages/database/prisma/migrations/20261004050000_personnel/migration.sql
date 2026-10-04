-- CreateEnum
CREATE TYPE "PersonnelStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
-- CreateTable
CREATE TABLE "ranks" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "order" INTEGER NOT NULL,
    "isEntry" BOOLEAN NOT NULL DEFAULT false,
    "discordRoleId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ranks_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discordRoleId" TEXT,
    "leaderUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "personnel_records" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rpName" TEXT NOT NULL,
    "serviceNumber" TEXT,
    "rankId" TEXT,
    "teamId" TEXT,
    "status" "PersonnelStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "probationEndsAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archivedReason" TEXT,
    "sourceSubmissionId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "personnel_records_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "personnel_entries" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personnel_entries_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "personnel_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personnel_events_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "ranks_guildId_order_idx" ON "ranks"("guildId", "order");
-- CreateIndex
CREATE UNIQUE INDEX "ranks_guildId_name_key" ON "ranks"("guildId", "name");
-- CreateIndex
CREATE INDEX "teams_guildId_idx" ON "teams"("guildId");
-- CreateIndex
CREATE UNIQUE INDEX "teams_guildId_name_key" ON "teams"("guildId", "name");
-- CreateIndex
CREATE INDEX "personnel_records_guildId_status_idx" ON "personnel_records"("guildId", "status");
-- CreateIndex
CREATE INDEX "personnel_records_guildId_teamId_idx" ON "personnel_records"("guildId", "teamId");
-- CreateIndex
CREATE UNIQUE INDEX "personnel_records_guildId_userId_key" ON "personnel_records"("guildId", "userId");
-- CreateIndex
CREATE UNIQUE INDEX "personnel_records_guildId_serviceNumber_key" ON "personnel_records"("guildId", "serviceNumber");
-- CreateIndex
CREATE INDEX "personnel_entries_recordId_kind_idx" ON "personnel_entries"("recordId", "kind");
-- CreateIndex
CREATE INDEX "personnel_entries_guildId_kind_idx" ON "personnel_entries"("guildId", "kind");
-- CreateIndex
CREATE INDEX "personnel_events_recordId_createdAt_idx" ON "personnel_events"("recordId", "createdAt");
-- AddForeignKey
ALTER TABLE "ranks" ADD CONSTRAINT "ranks_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "personnel_records" ADD CONSTRAINT "personnel_records_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "personnel_records" ADD CONSTRAINT "personnel_records_rankId_fkey" FOREIGN KEY ("rankId") REFERENCES "ranks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "personnel_records" ADD CONSTRAINT "personnel_records_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "personnel_entries" ADD CONSTRAINT "personnel_entries_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "personnel_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "personnel_events" ADD CONSTRAINT "personnel_events_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "personnel_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
