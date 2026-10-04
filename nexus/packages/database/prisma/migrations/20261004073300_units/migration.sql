-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'BUSY', 'BREAK', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "UnitRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'Streife',
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "statusSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vehicle" TEXT,
    "location" TEXT,
    "note" TEXT,
    "activeKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "disbandedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_members" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "role" "UnitRole" NOT NULL DEFAULT 'MEMBER',
    "openKey" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "unit_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "data" JSONB,

    CONSTRAINT "unit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "units_guildId_activeKey_idx" ON "units"("guildId", "activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "units_guildId_callsign_activeKey_key" ON "units"("guildId", "callsign", "activeKey");

-- CreateIndex
CREATE INDEX "unit_members_unitId_idx" ON "unit_members"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_members_guildId_userId_openKey_key" ON "unit_members"("guildId", "userId", "openKey");

-- CreateIndex
CREATE INDEX "unit_events_unitId_at_idx" ON "unit_events"("unitId", "at");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_members" ADD CONSTRAINT "unit_members_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_events" ADD CONSTRAINT "unit_events_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
