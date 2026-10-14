-- Discord Message Builder: Vorlagen/Entwürfe, Kategorien, Versandhistorie, Komponenten-Aktionen, optionale Webhooks.
-- Nicht destruktiv: nur neue Tabellen und Standard-Kategorien; bestehende Daten bleiben unverändert.

-- CreateTable
CREATE TABLE "MessageBuilderCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageBuilderCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageBuilderDocument" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID,
    "data" JSONB NOT NULL,
    "channelId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "MessageBuilderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageBuilderSend" (
    "id" UUID NOT NULL,
    "documentId" UUID,
    "documentName" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "channelId" TEXT,
    "channelName" TEXT,
    "webhookId" UUID,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdById" UUID,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MessageBuilderSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageBuilderSendItem" (
    "id" UUID NOT NULL,
    "sendId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "error" TEXT,
    "payload" JSONB,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MessageBuilderSendItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageBuilderAction" (
    "id" UUID NOT NULL,
    "sendId" UUID,
    "kind" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageBuilderAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageBuilderWebhook" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "channelId" TEXT,
    "guildId" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "MessageBuilderWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageBuilderCategory_name_key" ON "MessageBuilderCategory"("name");

-- CreateIndex
CREATE INDEX "MessageBuilderDocument_kind_archivedAt_updatedAt_idx" ON "MessageBuilderDocument"("kind", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "MessageBuilderSend_createdAt_idx" ON "MessageBuilderSend"("createdAt");

-- CreateIndex
CREATE INDEX "MessageBuilderSend_status_idx" ON "MessageBuilderSend"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MessageBuilderSendItem_sendId_position_key" ON "MessageBuilderSendItem"("sendId", "position");

-- CreateIndex
CREATE INDEX "MessageBuilderAction_sendId_idx" ON "MessageBuilderAction"("sendId");

-- AddForeignKey
ALTER TABLE "MessageBuilderDocument" ADD CONSTRAINT "MessageBuilderDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MessageBuilderCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageBuilderSendItem" ADD CONSTRAINT "MessageBuilderSendItem_sendId_fkey" FOREIGN KEY ("sendId") REFERENCES "MessageBuilderSend"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Standard-Kategorien (im Editor umbenennbar/löschbar; vorhandene gleichnamige bleiben unverändert)
INSERT INTO "MessageBuilderCategory" ("id", "name", "position", "updatedAt") VALUES
  (gen_random_uuid(), 'Allgemein', 0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Polizei', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Leitstelle', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dienstantritt', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Dienstende', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Einsatzmeldung', 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Personalinformation', 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Ankündigung', 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Wartung', 8, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Sonstiges', 9, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
