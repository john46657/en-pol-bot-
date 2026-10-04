-- CreateTable
CREATE TABLE "dashboard_assets" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_assets_guildId_createdAt_idx" ON "dashboard_assets"("guildId", "createdAt");

-- AddForeignKey
ALTER TABLE "dashboard_assets" ADD CONSTRAINT "dashboard_assets_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
