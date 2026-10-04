-- CreateEnum
CREATE TYPE "TeamState" AS ENUM ('ACTIVE', 'PAUSE', 'OFF_DUTY', 'SUSPENDED');

-- AlterTable
ALTER TABLE "personnel_records" ADD COLUMN "archivedBy" TEXT,
ADD COLUMN "teamState" "TeamState" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "teamStateReason" TEXT,
ADD COLUMN "teamStateAt" TIMESTAMP(3),
ADD COLUMN "teamStateBy" TEXT;
