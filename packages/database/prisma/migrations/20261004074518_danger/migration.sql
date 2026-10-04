-- CreateTable
CREATE TABLE "danger_levels" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#808080',
    "emoji" TEXT,
    "description" TEXT,
    "allowedRoleIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "danger_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "danger_state" (
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "setBy" TEXT NOT NULL,
    "reason" TEXT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channelId" TEXT,
    "messageId" TEXT,

    CONSTRAINT "danger_state_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "danger_events" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "fromLevel" INTEGER,
    "toLevel" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "danger_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "danger_levels_guildId_level_key" ON "danger_levels"("guildId", "level");

-- CreateIndex
CREATE INDEX "danger_events_guildId_at_idx" ON "danger_events"("guildId", "at");

-- AddForeignKey
ALTER TABLE "danger_levels" ADD CONSTRAINT "danger_levels_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
