-- Ausbildungstermine: Ankündigung mit Anmeldung (Discord + Dashboard), Auswertung, Beförderung bei Bestehen
CREATE TABLE "HrTrainingSession" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "trainingId" UUID,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "forRank" TEXT,
    "duration" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "instructorId" UUID,
    "channelId" TEXT,
    "guildId" TEXT,
    "promoteRankId" UUID,
    "maxSignups" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "signups" JSONB NOT NULL DEFAULT '[]',
    "attended" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "passed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actualDuration" TEXT,
    "evaluationNote" TEXT,
    "evaluatedAt" TIMESTAMP(3),
    "evaluatedById" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrTrainingSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HrTrainingSession_number_key" ON "HrTrainingSession"("number");
CREATE INDEX "HrTrainingSession_startsAt_idx" ON "HrTrainingSession"("startsAt");
