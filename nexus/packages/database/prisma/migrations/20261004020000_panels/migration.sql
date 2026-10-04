-- CreateTable
CREATE TABLE "panels" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "autoUpdate" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "panels_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "panels_guildId_idx" ON "panels"("guildId");
-- AddForeignKey
ALTER TABLE "panels" ADD CONSTRAINT "panels_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
