-- Message Builder je Discord-Server getrennt (Vorlagen, Entwürfe, Kategorien, Versandhistorie, Aktionen).
-- Nicht destruktiv: neue Spalte "guildId" (NULL = noch keinem Server zugeordnet; die Rück-Umstellung auf mehrere Server
-- ordnet vorhandene Einträge dem Heimat-Server zu).

ALTER TABLE "MessageBuilderCategory" ADD COLUMN "guildId" TEXT;
ALTER TABLE "MessageBuilderDocument" ADD COLUMN "guildId" TEXT;
ALTER TABLE "MessageBuilderSend" ADD COLUMN "guildId" TEXT;
ALTER TABLE "MessageBuilderAction" ADD COLUMN "guildId" TEXT;

-- Kategorienamen eindeutig je Server
DROP INDEX "MessageBuilderCategory_name_key";
CREATE UNIQUE INDEX "MessageBuilderCategory_guildId_name_key" ON "MessageBuilderCategory"("guildId", "name");
CREATE UNIQUE INDEX "MessageBuilderCategory_shared_name_key" ON "MessageBuilderCategory"("name") WHERE "guildId" IS NULL;

CREATE INDEX "MessageBuilderDocument_guildId_idx" ON "MessageBuilderDocument"("guildId");
CREATE INDEX "MessageBuilderSend_guildId_createdAt_idx" ON "MessageBuilderSend"("guildId", "createdAt");
CREATE INDEX "MessageBuilderWebhook_guildId_idx" ON "MessageBuilderWebhook"("guildId");
