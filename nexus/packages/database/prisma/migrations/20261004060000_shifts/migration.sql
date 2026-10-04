-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');
-- CreateTable
CREATE TABLE "shift_types" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "requiredRoleIds" TEXT[],
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 480,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shift_types_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "recordId" TEXT,
    "status" "ShiftStatus" NOT NULL DEFAULT 'ACTIVE',
    "openKey" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "endedBy" TEXT,
    "endReason" TEXT,
    "flaggedLongAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "shift_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "data" JSONB,
    CONSTRAINT "shift_events_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "shift_types_guildId_idx" ON "shift_types"("guildId");
-- CreateIndex
CREATE UNIQUE INDEX "shift_types_guildId_name_key" ON "shift_types"("guildId", "name");
-- CreateIndex
CREATE INDEX "shifts_guildId_userId_startedAt_idx" ON "shifts"("guildId", "userId", "startedAt");
-- CreateIndex
CREATE INDEX "shifts_guildId_status_idx" ON "shifts"("guildId", "status");
-- CreateIndex
CREATE INDEX "shifts_guildId_typeId_startedAt_idx" ON "shifts"("guildId", "typeId", "startedAt");
-- CreateIndex
CREATE UNIQUE INDEX "shifts_guildId_userId_openKey_key" ON "shifts"("guildId", "userId", "openKey");
-- CreateIndex
CREATE INDEX "shift_events_shiftId_at_idx" ON "shift_events"("shiftId", "at");
-- AddForeignKey
ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "shift_events" ADD CONSTRAINT "shift_events_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
