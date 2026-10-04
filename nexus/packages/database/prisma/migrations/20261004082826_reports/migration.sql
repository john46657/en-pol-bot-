-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "generatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_guildId_kind_periodStart_idx" ON "reports"("guildId", "kind", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "reports_guildId_kind_periodStart_key" ON "reports"("guildId", "kind", "periodStart");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
