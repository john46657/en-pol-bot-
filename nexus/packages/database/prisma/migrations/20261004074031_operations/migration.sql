-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('REQUESTED', 'EN_ROUTE', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "operation_counters" (
    "guildId" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "operation_counters_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "operations" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "priority" "OperationPriority" NOT NULL DEFAULT 'NORMAL',
    "description" TEXT,
    "status" "OperationStatus" NOT NULL DEFAULT 'REQUESTED',
    "leaderId" TEXT,
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "report" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_units" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "activeKey" TEXT,
    "prevStatus" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "operation_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_participants" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "callsign" TEXT,
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "recordEntryId" TEXT,

    CONSTRAINT "operation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "data" JSONB,

    CONSTRAINT "operation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operations_guildId_status_idx" ON "operations"("guildId", "status");

-- CreateIndex
CREATE INDEX "operations_guildId_createdAt_idx" ON "operations"("guildId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "operations_guildId_number_key" ON "operations"("guildId", "number");

-- CreateIndex
CREATE INDEX "operation_units_operationId_idx" ON "operation_units"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "operation_units_unitId_activeKey_key" ON "operation_units"("unitId", "activeKey");

-- CreateIndex
CREATE UNIQUE INDEX "operation_participants_operationId_userId_key" ON "operation_participants"("operationId", "userId");

-- CreateIndex
CREATE INDEX "operation_events_operationId_at_idx" ON "operation_events"("operationId", "at");

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_units" ADD CONSTRAINT "operation_units_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_participants" ADD CONSTRAINT "operation_participants_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_events" ADD CONSTRAINT "operation_events_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
