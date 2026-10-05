-- CreateTable
CREATE TABLE "log_forwards" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "log_forwards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_forward_cursors" (
    "guildId" TEXT NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL,
    "lastId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "log_forward_cursors_pkey" PRIMARY KEY ("guildId")
);

-- CreateIndex
CREATE UNIQUE INDEX "log_forwards_guildId_area_key" ON "log_forwards"("guildId", "area");

-- AddForeignKey
ALTER TABLE "log_forwards" ADD CONSTRAINT "log_forwards_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

