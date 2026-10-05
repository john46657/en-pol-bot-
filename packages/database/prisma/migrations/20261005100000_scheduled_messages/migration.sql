-- CreateTable
CREATE TABLE "scheduled_messages" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "scheduleType" TEXT NOT NULL,
    "runAt" TIMESTAMP(3),
    "intervalMinutes" INTEGER,
    "timeOfDay" TEXT,
    "weekdays" INTEGER[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_messages_enabled_nextRunAt_idx" ON "scheduled_messages"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "scheduled_messages_guildId_idx" ON "scheduled_messages"("guildId");

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

