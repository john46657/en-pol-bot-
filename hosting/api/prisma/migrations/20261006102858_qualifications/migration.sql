/*
  Warnings:

  - You are about to drop the `SekApplication` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "SekApplication";

-- CreateTable
CREATE TABLE "QualificationApplication" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT NOT NULL,
    "userId" UUID,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualificationApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QualificationApplication_number_key" ON "QualificationApplication"("number");

-- CreateIndex
CREATE INDEX "QualificationApplication_discordId_status_idx" ON "QualificationApplication"("discordId", "status");

-- CreateIndex
CREATE INDEX "QualificationApplication_status_createdAt_idx" ON "QualificationApplication"("status", "createdAt");
