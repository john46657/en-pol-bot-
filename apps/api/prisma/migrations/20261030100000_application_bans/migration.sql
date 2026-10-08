-- Bewerbungssperren: wer sich wofür nicht bewerben darf
CREATE TABLE "ApplicationBan" (
    "id" UUID NOT NULL,
    "guildId" TEXT,
    "discordId" TEXT,
    "robloxUserId" TEXT,
    "name" TEXT NOT NULL,
    "scopes" TEXT[],
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedById" UUID,

    CONSTRAINT "ApplicationBan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApplicationBan_guildId_idx" ON "ApplicationBan"("guildId");
CREATE INDEX "ApplicationBan_discordId_idx" ON "ApplicationBan"("discordId");
CREATE INDEX "ApplicationBan_robloxUserId_idx" ON "ApplicationBan"("robloxUserId");
