-- AlterEnum
ALTER TYPE "WantedStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "wanted_notices" ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "expiredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "wanted_notices_status_expiresAt_idx" ON "wanted_notices"("status", "expiresAt");
