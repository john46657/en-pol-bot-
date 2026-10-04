-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ENDED');

-- CreateTable
CREATE TABLE "absence_counters" (
    "guildId" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "absence_counters_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "endedAt" TIMESTAMP(3),
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "absences_guildId_userId_status_idx" ON "absences"("guildId", "userId", "status");

-- CreateIndex
CREATE INDEX "absences_guildId_status_startDate_idx" ON "absences"("guildId", "status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "absences_guildId_number_key" ON "absences"("guildId", "number");

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
