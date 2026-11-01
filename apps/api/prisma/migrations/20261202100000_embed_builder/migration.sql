-- Embed Builder (Erweiterung des Message Builders). Nicht destruktiv: nur neue Spalten (alle optional bzw. mit Standardwert)
-- und eine neue Tabelle. Bestehende Vorlagen, Entwürfe, Versände, Webhooks und Bot-Einstellungen bleiben unverändert.

-- Versand: Art (SEND/EDIT), Thread/Forum-Beitrag, Inhalt zum erneuten Laden, verwendete Vorlage, bearbeitete Nachricht
ALTER TABLE "MessageBuilderSend" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'SEND';
ALTER TABLE "MessageBuilderSend" ADD COLUMN "threadId" TEXT;
ALTER TABLE "MessageBuilderSend" ADD COLUMN "threadName" TEXT;
ALTER TABLE "MessageBuilderSend" ADD COLUMN "data" JSONB;
ALTER TABLE "MessageBuilderSend" ADD COLUMN "templateName" TEXT;
ALTER TABLE "MessageBuilderSend" ADD COLUMN "targetId" UUID;
-- Kanal, in dem die einzelne Nachricht gelandet ist (z. B. neu angelegter Forum-Beitrag)
ALTER TABLE "MessageBuilderSendItem" ADD COLUMN "channelId" TEXT;

-- Entwurf aus Vorlage: Herkunft merken (für „verwendete Vorlage“ in der Historie)
ALTER TABLE "MessageBuilderDocument" ADD COLUMN "sourceTemplateId" UUID;

-- Webhooks: Standard-Absenderprofil, Daten von Discord, letzter Verbindungstest
ALTER TABLE "MessageBuilderWebhook" ADD COLUMN "username" TEXT;
ALTER TABLE "MessageBuilderWebhook" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "MessageBuilderWebhook" ADD COLUMN "discordName" TEXT;
ALTER TABLE "MessageBuilderWebhook" ADD COLUMN "discordAvatar" TEXT;
ALTER TABLE "MessageBuilderWebhook" ADD COLUMN "lastCheckAt" TIMESTAMP(3);
ALTER TABLE "MessageBuilderWebhook" ADD COLUMN "lastCheckOk" BOOLEAN;
ALTER TABLE "MessageBuilderWebhook" ADD COLUMN "lastCheckError" TEXT;

-- Gespeicherte Discord-Nachrichten (gesendet über den Embed Builder oder per Link geladen) zum Bearbeiten/Duplizieren
CREATE TABLE "MessageBuilderMessage" (
    "id" UUID NOT NULL,
    "guildId" TEXT,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT,
    "threadId" TEXT,
    "messageId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "webhookId" UUID,
    "sendId" UUID,
    "position" INTEGER,
    "data" JSONB,
    "keptCustomIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'READY',
    "error" TEXT,
    "sentById" UUID,
    "createdById" UUID,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastEditedAt" TIMESTAMP(3),
    "lastEditedById" UUID,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "MessageBuilderMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageBuilderMessage_guildId_createdAt_idx" ON "MessageBuilderMessage"("guildId", "createdAt");
CREATE INDEX "MessageBuilderMessage_messageId_idx" ON "MessageBuilderMessage"("messageId");
