-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "DamageSeverity" AS ENUM ('MINOR', 'MAJOR', 'TOTAL');

-- CreateEnum
CREATE TYPE "PenaltyKind" AS ENUM ('FINE', 'WARNING', 'POINTS', 'LICENSE_REVOCATION', 'VEHICLE_SEIZURE');

-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "plateKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "unitId" TEXT,
    "driverId" TEXT,
    "notes" TEXT,
    "activeKey" TEXT,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_damages" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "DamageSeverity" NOT NULL DEFAULT 'MINOR',
    "reportedBy" TEXT NOT NULL,
    "repairedAt" TIMESTAMP(3),
    "repairedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_damages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "data" JSONB,

    CONSTRAINT "vehicle_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalty_counters" (
    "guildId" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "penalty_counters_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "penalties" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "PenaltyKind" NOT NULL,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'ACTIVE',
    "subjectName" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "amount" INTEGER,
    "points" INTEGER,
    "durationDays" INTEGER,
    "until" TIMESTAMP(3),
    "plate" TEXT,
    "reason" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "operationNumber" INTEGER,
    "personnelEntryId" TEXT,
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "penalties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicles_guildId_status_idx" ON "vehicles"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_guildId_plateKey_activeKey_key" ON "vehicles"("guildId", "plateKey", "activeKey");

-- CreateIndex
CREATE INDEX "vehicle_damages_vehicleId_repairedAt_idx" ON "vehicle_damages"("vehicleId", "repairedAt");

-- CreateIndex
CREATE INDEX "vehicle_events_vehicleId_at_idx" ON "vehicle_events"("vehicleId", "at");

-- CreateIndex
CREATE INDEX "penalties_guildId_subjectKey_idx" ON "penalties"("guildId", "subjectKey");

-- CreateIndex
CREATE INDEX "penalties_guildId_issuedBy_idx" ON "penalties"("guildId", "issuedBy");

-- CreateIndex
CREATE UNIQUE INDEX "penalties_guildId_number_key" ON "penalties"("guildId", "number");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_damages" ADD CONSTRAINT "vehicle_damages_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_events" ADD CONSTRAINT "vehicle_events_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
