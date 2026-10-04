-- CreateEnum
CREATE TYPE "RadioLevel" AS ENUM ('LISTEN', 'SPEAK', 'FULL');

-- CreateEnum
CREATE TYPE "RadioArea" AS ENUM ('GENERAL', 'SPECIAL');

-- CreateTable
CREATE TABLE "radio_channels" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" "RadioArea" NOT NULL DEFAULT 'GENERAL',
    "requiresDuty" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radio_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_access" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "RadioLevel" NOT NULL DEFAULT 'SPEAK',
    "special" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "radio_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "data" JSONB,

    CONSTRAINT "radio_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "radio_channels_guildId_channelId_key" ON "radio_channels"("guildId", "channelId");

-- CreateIndex
CREATE INDEX "radio_access_guildId_level_idx" ON "radio_access"("guildId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "radio_access_guildId_userId_key" ON "radio_access"("guildId", "userId");

-- CreateIndex
CREATE INDEX "radio_events_guildId_userId_at_idx" ON "radio_events"("guildId", "userId", "at");

-- AddForeignKey
ALTER TABLE "radio_channels" ADD CONSTRAINT "radio_channels_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_access" ADD CONSTRAINT "radio_access_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
