-- CreateTable
CREATE TABLE "TicketPanel" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "emoji" TEXT,
    "color" INTEGER NOT NULL DEFAULT 3899638,
    "thumbnailUrl" TEXT,
    "imageUrl" TEXT,
    "bannerUrl" TEXT,
    "footer" TEXT,
    "footerIconUrl" TEXT,
    "authorName" TEXT,
    "authorIconUrl" TEXT,
    "style" TEXT NOT NULL DEFAULT 'BUTTONS',
    "placeholder" TEXT NOT NULL DEFAULT 'Wähle eine Kategorie …',
    "channelId" TEXT,
    "categoryIds" UUID[],
    "allowedRoleIds" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "messageChannelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "emoji" TEXT,
    "color" INTEGER NOT NULL DEFAULT 3899638,
    "buttonStyle" TEXT NOT NULL DEFAULT 'secondary',
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "discordCategoryId" TEXT,
    "channelNameFormat" TEXT NOT NULL DEFAULT 'ticket-{username}',
    "staffRoleIds" TEXT[],
    "extraRoleIds" TEXT[],
    "accessRoleNames" TEXT[],
    "requiredRoleIds" TEXT[],
    "allowedUserIds" TEXT[],
    "maxOpen" INTEGER NOT NULL DEFAULT 1,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 0,
    "defaultPriorityId" UUID,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "welcomeTitle" TEXT NOT NULL DEFAULT '🎫 {category}',
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Hallo {user}!

Beschreibe dein Anliegen so genau wie möglich. Ein Teammitglied kümmert sich schnellstmöglich darum.',
    "mentionStaff" BOOLEAN NOT NULL DEFAULT true,
    "mentionText" TEXT NOT NULL DEFAULT '',
    "buttons" JSONB NOT NULL DEFAULT '[]',
    "claimMode" TEXT NOT NULL DEFAULT 'SINGLE',
    "claimMessage" TEXT NOT NULL DEFAULT '👤 Bearbeiter: {staff}',
    "claimNotifyStaff" BOOLEAN NOT NULL DEFAULT false,
    "creatorCanClose" BOOLEAN NOT NULL DEFAULT true,
    "closeReasonMode" TEXT NOT NULL DEFAULT 'OPTIONAL',
    "closeReasonSource" TEXT NOT NULL DEFAULT 'BOTH',
    "closeRemovesAccess" BOOLEAN NOT NULL DEFAULT true,
    "allowReopen" BOOLEAN NOT NULL DEFAULT true,
    "transcriptOnClose" BOOLEAN NOT NULL DEFAULT true,
    "transcriptChannelId" TEXT,
    "transcriptToUser" BOOLEAN NOT NULL DEFAULT false,
    "ratingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ratingQuestion" TEXT NOT NULL DEFAULT 'Wie zufrieden warst du mit dem Support?',
    "autoCloseMinutes" INTEGER NOT NULL DEFAULT 0,
    "autoCloseWarnMinutes" INTEGER NOT NULL DEFAULT 0,
    "autoCloseMessage" TEXT NOT NULL DEFAULT '⏰ {user}, dieses Ticket wird bald wegen Inaktivität geschlossen. Schreib eine Nachricht, wenn du noch Hilfe brauchst.',
    "deleteAfterMinutes" INTEGER NOT NULL DEFAULT -1,
    "escalationRoleIds" TEXT[],
    "escalationPriorityId" UUID,
    "escalationMessage" TEXT NOT NULL DEFAULT '🟠 Dieses Ticket wurde eskaliert. {staff}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketStatus" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "color" INTEGER NOT NULL DEFAULT 3899638,
    "position" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'OPEN',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "isEscalation" BOOLEAN NOT NULL DEFAULT false,
    "isClose" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TicketStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPriority" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "color" INTEGER NOT NULL DEFAULT 3899638,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "allowedRoleNames" TEXT[],
    "notifyRoleIds" TEXT[],

    CONSTRAINT "TicketPriority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketCloseReason" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketCloseReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "categoryId" UUID NOT NULL,
    "panelId" UUID,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT,
    "controlMessageId" TEXT,
    "name" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "creatorUserId" UUID,
    "statusId" UUID NOT NULL,
    "priorityId" UUID,
    "claimers" TEXT[],
    "answers" JSONB NOT NULL DEFAULT '[]',
    "questionIndex" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "closeReason" TEXT,
    "closedById" TEXT,
    "closedByName" TEXT,
    "closedAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warnedAt" TIMESTAMP(3),
    "deleteAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAccess" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "discordId" TEXT,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorAvatar" TEXT,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "embeds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketNote" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorId" TEXT,
    "authorUserId" UUID,
    "authorName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketLog" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTranscript" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "categoryName" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "claimers" TEXT[],
    "statusName" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketRating" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "creatorId" TEXT NOT NULL,
    "staffIds" TEXT[],
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_channelId_key" ON "SupportTicket"("channelId");

-- CreateIndex
CREATE INDEX "SupportTicket_creatorId_categoryId_idx" ON "SupportTicket"("creatorId", "categoryId");

-- CreateIndex
CREATE INDEX "SupportTicket_statusId_idx" ON "SupportTicket"("statusId");

-- CreateIndex
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketAccess_ticketId_targetId_key" ON "TicketAccess"("ticketId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketMessage_discordId_key" ON "TicketMessage"("discordId");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketNote_ticketId_idx" ON "TicketNote"("ticketId");

-- CreateIndex
CREATE INDEX "TicketLog_ticketId_createdAt_idx" ON "TicketLog"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketTranscript_ticketId_idx" ON "TicketTranscript"("ticketId");

-- CreateIndex
CREATE INDEX "TicketTranscript_createdAt_idx" ON "TicketTranscript"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketRating_ticketId_key" ON "TicketRating"("ticketId");
