-- Discord-Server-Backups (wie Xenon): Rollen, Kanäle, Rechte und Servereinstellungen
CREATE TABLE "DiscordBackup" (
    "id" UUID NOT NULL,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "data" JSONB,
    "stats" JSONB,
    "error" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),
    "restoreResult" JSONB,
    CONSTRAINT "DiscordBackup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiscordBackup_guildId_createdAt_idx" ON "DiscordBackup"("guildId", "createdAt");
