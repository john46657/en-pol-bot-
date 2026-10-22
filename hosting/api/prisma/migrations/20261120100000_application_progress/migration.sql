-- Angefangene Bewerbungen (noch nicht eingereicht) – Anzeige „in Bearbeitung“ im Dashboard
CREATE TABLE "ApplicationProgress" (
    "id" UUID NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "guildId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'DISCORD',
    "answered" INTEGER,
    "total" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationProgress_discordId_unit_key" ON "ApplicationProgress"("discordId", "unit");
CREATE INDEX "ApplicationProgress_expiresAt_idx" ON "ApplicationProgress"("expiresAt");
