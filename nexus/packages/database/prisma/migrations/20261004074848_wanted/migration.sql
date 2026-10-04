-- CreateEnum
CREATE TYPE "WantedKind" AS ENUM ('PERSON', 'VEHICLE');

-- CreateEnum
CREATE TYPE "WantedStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "wanted_counters" (
    "guildId" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wanted_counters_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "wanted_notices" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "WantedKind" NOT NULL,
    "status" "WantedStatus" NOT NULL DEFAULT 'ACTIVE',
    "subjectKey" TEXT NOT NULL,
    "subjectName" TEXT,
    "subjectUserId" TEXT,
    "appearance" TEXT,
    "plate" TEXT,
    "vehicleModel" TEXT,
    "vehicleColor" TEXT,
    "ownerName" TEXT,
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "lastSeen" TEXT,
    "notes" TEXT,
    "activeKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wanted_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wanted_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "data" JSONB,

    CONSTRAINT "wanted_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wanted_notices_guildId_kind_status_idx" ON "wanted_notices"("guildId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wanted_notices_guildId_number_key" ON "wanted_notices"("guildId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "wanted_notices_guildId_kind_subjectKey_activeKey_key" ON "wanted_notices"("guildId", "kind", "subjectKey", "activeKey");

-- CreateIndex
CREATE INDEX "wanted_events_noticeId_at_idx" ON "wanted_events"("noticeId", "at");

-- AddForeignKey
ALTER TABLE "wanted_notices" ADD CONSTRAINT "wanted_notices_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wanted_events" ADD CONSTRAINT "wanted_events_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "wanted_notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
