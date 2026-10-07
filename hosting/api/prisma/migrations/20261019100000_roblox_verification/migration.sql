-- Roblox-Verifizierung (wie RoVer)
CREATE TABLE "RobloxLink" (
    "discordId" TEXT NOT NULL,
    "discordName" TEXT,
    "robloxId" TEXT NOT NULL,
    "robloxName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RobloxLink_pkey" PRIMARY KEY ("discordId")
);
CREATE INDEX "RobloxLink_robloxId_idx" ON "RobloxLink"("robloxId");
CREATE INDEX "RobloxLink_robloxName_idx" ON "RobloxLink"("robloxName");

CREATE TABLE "RobloxVerifyCode" (
    "discordId" TEXT NOT NULL,
    "robloxId" TEXT NOT NULL,
    "robloxName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RobloxVerifyCode_pkey" PRIMARY KEY ("discordId")
);
