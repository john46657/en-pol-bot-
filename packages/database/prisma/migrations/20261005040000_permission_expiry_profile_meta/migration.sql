-- AlterTable
ALTER TABLE "permission_profiles" ADD COLUMN "color" TEXT,
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "user_permissions" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "user_permissions_expiresAt_idx" ON "user_permissions"("expiresAt");
