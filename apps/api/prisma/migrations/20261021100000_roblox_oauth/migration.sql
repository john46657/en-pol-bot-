-- „Mit Roblox anmelden“ (OAuth) für die Roblox-Verifizierung
CREATE TABLE "RobloxOAuthState" (
    "state" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT,
    "guildId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RobloxOAuthState_pkey" PRIMARY KEY ("state")
);
CREATE INDEX "RobloxOAuthState_discordId_idx" ON "RobloxOAuthState"("discordId");
