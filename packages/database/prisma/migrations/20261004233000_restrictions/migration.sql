-- CreateEnum
CREATE TYPE "RestrictionType" AS ENUM ('APPLICATION', 'TICKET', 'FACTION', 'RADIO');

-- CreateEnum
CREATE TYPE "RestrictionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "restrictions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RestrictionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" "RestrictionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "restrictions_guildId_userId_type_status_idx" ON "restrictions"("guildId", "userId", "type", "status");

-- CreateIndex
CREATE INDEX "restrictions_status_endsAt_idx" ON "restrictions"("status", "endsAt");

-- AddForeignKey
ALTER TABLE "restrictions" ADD CONSTRAINT "restrictions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
