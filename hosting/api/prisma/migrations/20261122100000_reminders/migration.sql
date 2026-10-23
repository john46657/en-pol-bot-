-- Persönliche Erinnerungen (/remind-me): nur neue Tabelle, bestehende Daten bleiben unverändert
CREATE TABLE "Reminder" (
    "id" UUID NOT NULL,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT,
    "channelId" TEXT,
    "text" TEXT NOT NULL,
    "dm" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fireCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reminder_status_dueAt_idx" ON "Reminder"("status", "dueAt");
CREATE INDEX "Reminder_discordId_status_idx" ON "Reminder"("discordId", "status");
