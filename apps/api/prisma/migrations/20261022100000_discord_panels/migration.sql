-- CreateTable
CREATE TABLE "PanelSubmission" (
    "id" UUID NOT NULL,
    "panelId" UUID NOT NULL,
    "guildId" TEXT,
    "discordId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PanelSubmission_panelId_discordId_idx" ON "PanelSubmission"("panelId", "discordId");

-- CreateIndex
CREATE INDEX "PanelSubmission_panelId_createdAt_idx" ON "PanelSubmission"("panelId", "createdAt");

