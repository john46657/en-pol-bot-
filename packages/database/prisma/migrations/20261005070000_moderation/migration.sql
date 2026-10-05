-- CreateTable
CREATE TABLE "moderation_cases" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "durationMin" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "revokedAt" TIMESTAMP(3),
    "dmDelivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_cases_guildId_userId_createdAt_idx" ON "moderation_cases"("guildId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_cases_guildId_type_status_idx" ON "moderation_cases"("guildId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_cases_guildId_number_key" ON "moderation_cases"("guildId", "number");

-- AddForeignKey
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

