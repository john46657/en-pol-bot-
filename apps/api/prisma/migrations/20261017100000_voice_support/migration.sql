-- Sprach-Support (Warteraum → Support-Fall)
CREATE TABLE "VoiceSupportCase" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "claimedById" TEXT,
    "claimedByName" TEXT,
    "claimedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedByName" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "channelId" TEXT,
    "createdChannel" BOOLEAN NOT NULL DEFAULT false,
    "notifyChannelId" TEXT,
    "notifyMessageId" TEXT,
    "threadId" TEXT,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceSupportCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VoiceSupportCase_number_key" ON "VoiceSupportCase"("number");
CREATE INDEX "VoiceSupportCase_guildId_status_idx" ON "VoiceSupportCase"("guildId", "status");
CREATE INDEX "VoiceSupportCase_userId_status_idx" ON "VoiceSupportCase"("userId", "status");
CREATE INDEX "VoiceSupportCase_channelId_idx" ON "VoiceSupportCase"("channelId");
