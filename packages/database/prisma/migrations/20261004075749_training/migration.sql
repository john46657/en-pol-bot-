-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('PLANNED', 'RUNNING', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ENROLLED', 'PASSED', 'FAILED', 'WITHDRAWN', 'REMOVED');

-- CreateTable
CREATE TABLE "training_courses" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "theoryMax" INTEGER NOT NULL DEFAULT 0,
    "practiceMax" INTEGER NOT NULL DEFAULT 0,
    "examMax" INTEGER NOT NULL DEFAULT 0,
    "passPercent" INTEGER NOT NULL DEFAULT 60,
    "grantRoleId" TEXT,
    "requiredRoleIds" TEXT[],
    "maxParticipants" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_counters" (
    "guildId" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "training_counters_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "trainings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "TrainingStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "trainerIds" TEXT[],
    "maxParticipants" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_participants" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ENROLLED',
    "theoryPoints" INTEGER,
    "practicePoints" INTEGER,
    "examPoints" INTEGER,
    "percent" DOUBLE PRECISION,
    "gradedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "entryId" TEXT,
    "roleResult" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "data" JSONB,

    CONSTRAINT "training_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_courses_guildId_name_key" ON "training_courses"("guildId", "name");

-- CreateIndex
CREATE INDEX "trainings_guildId_status_scheduledAt_idx" ON "trainings"("guildId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "trainings_guildId_number_key" ON "trainings"("guildId", "number");

-- CreateIndex
CREATE INDEX "training_participants_guildId_userId_idx" ON "training_participants"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "training_participants_trainingId_userId_key" ON "training_participants"("trainingId", "userId");

-- CreateIndex
CREATE INDEX "training_events_trainingId_at_idx" ON "training_events"("trainingId", "at");

-- AddForeignKey
ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "training_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_participants" ADD CONSTRAINT "training_participants_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_events" ADD CONSTRAINT "training_events_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
