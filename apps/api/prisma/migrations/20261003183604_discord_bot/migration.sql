-- CreateTable
CREATE TABLE "DiscordLink" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "discordId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordLinkCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordLinkCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscordOutbox" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "channelKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "DiscordOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLink_userId_key" ON "DiscordLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLink_discordId_key" ON "DiscordLink"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLinkCode_codeHash_key" ON "DiscordLinkCode"("codeHash");

-- CreateIndex
CREATE INDEX "DiscordLinkCode_userId_idx" ON "DiscordLinkCode"("userId");

-- CreateIndex
CREATE INDEX "DiscordOutbox_sentAt_createdAt_idx" ON "DiscordOutbox"("sentAt", "createdAt");
