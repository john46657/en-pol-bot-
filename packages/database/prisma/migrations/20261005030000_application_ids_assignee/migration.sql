-- AlterTable
ALTER TABLE "applications" ADD COLUMN "idPrefix" TEXT;

-- AlterTable
ALTER TABLE "application_submissions" ADD COLUMN "assigneeUserId" TEXT,
ADD COLUMN "assignedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "application_number_counters" (
    "guildId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "application_number_counters_pkey" PRIMARY KEY ("guildId","prefix")
);
