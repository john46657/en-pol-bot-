-- Server-Konfiguration mit Branding: ausschließlich neue Tabellen (bestehende Daten bleiben unverändert).
-- CreateTable
CREATE TABLE "ServerConfig" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "setupStep" INTEGER NOT NULL DEFAULT 0,
    "setupCompletedAt" TIMESTAMP(3),
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerConfigRevision" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "modules" JSONB NOT NULL DEFAULT '{}',
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerConfigRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerAsset" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ServerAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServerConfig_serverId_key" ON "ServerConfig"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerConfigRevision_serverId_version_key" ON "ServerConfigRevision"("serverId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ServerAsset_storageKey_key" ON "ServerAsset"("storageKey");

-- CreateIndex
CREATE INDEX "ServerAsset_serverId_kind_idx" ON "ServerAsset"("serverId", "kind");

-- AddForeignKey
ALTER TABLE "ServerConfig" ADD CONSTRAINT "ServerConfig_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerConfigRevision" ADD CONSTRAINT "ServerConfigRevision_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerAsset" ADD CONSTRAINT "ServerAsset_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "DiscordServer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

