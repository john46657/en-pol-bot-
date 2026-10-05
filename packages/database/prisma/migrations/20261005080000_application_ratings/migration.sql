-- CreateTable
CREATE TABLE "application_ratings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_ratings_guildId_submissionId_idx" ON "application_ratings"("guildId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "application_ratings_submissionId_reviewerId_fieldId_key" ON "application_ratings"("submissionId", "reviewerId", "fieldId");

-- AddForeignKey
ALTER TABLE "application_ratings" ADD CONSTRAINT "application_ratings_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "application_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

