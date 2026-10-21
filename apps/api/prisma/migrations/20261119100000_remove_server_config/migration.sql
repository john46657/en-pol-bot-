-- Server-Konfiguration (Branding, Bilder, Einrichtungsassistent im Dashboard) entfernt – samt Daten.
-- Hochgeladene Bilddateien unter STORAGE_DIR/branding bleiben liegen und können von Hand gelöscht werden.

-- DropForeignKey
ALTER TABLE "ServerConfig" DROP CONSTRAINT "ServerConfig_serverId_fkey";

-- DropForeignKey
ALTER TABLE "ServerConfigRevision" DROP CONSTRAINT "ServerConfigRevision_serverId_fkey";

-- DropForeignKey
ALTER TABLE "ServerAsset" DROP CONSTRAINT "ServerAsset_serverId_fkey";

-- DropTable
DROP TABLE "ServerConfig";

-- DropTable
DROP TABLE "ServerConfigRevision";

-- DropTable
DROP TABLE "ServerAsset";
