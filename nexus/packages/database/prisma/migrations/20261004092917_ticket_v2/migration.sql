-- AlterTable
ALTER TABLE "ticket_categories" ADD COLUMN     "color" INTEGER,
ADD COLUMN     "formFields" JSONB,
ADD COLUMN     "maxOpenTotal" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "nameTemplate" TEXT,
ADD COLUMN     "requiredRoleIds" TEXT[],
ADD COLUMN     "transcriptEnabled" BOOLEAN;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "channelDeletedAt" TIMESTAMP(3),
ADD COLUMN     "deleteAt" TIMESTAMP(3),
ADD COLUMN     "formAnswers" JSONB,
ADD COLUMN     "lastPingAt" TIMESTAMP(3),
ADD COLUMN     "submissionId" TEXT,
ADD COLUMN     "transcriptHtml" TEXT;

-- CreateTable
CREATE TABLE "ticket_settings" (
    "guildId" TEXT NOT NULL,
    "panelChannelId" TEXT,
    "panelMessageId" TEXT,
    "transcriptChannelId" TEXT,
    "adminRoleIds" TEXT[],
    "nameTemplate" TEXT NOT NULL DEFAULT 'ticket-{number}-{user}',
    "deleteAfterMinutes" INTEGER NOT NULL DEFAULT 10,
    "transcriptEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dmTranscript" BOOLEAN NOT NULL DEFAULT false,
    "claimEnabled" BOOLEAN NOT NULL DEFAULT true,
    "claimExclusive" BOOLEAN NOT NULL DEFAULT false,
    "closeWithReason" BOOLEAN NOT NULL DEFAULT true,
    "confirmClose" BOOLEAN NOT NULL DEFAULT true,
    "loadEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hideFullCategories" BOOLEAN NOT NULL DEFAULT false,
    "color" INTEGER NOT NULL DEFAULT 5793266,
    "panelTitle" TEXT NOT NULL DEFAULT '🔷 Ticket-Support',
    "panelDescription" TEXT NOT NULL DEFAULT 'Wähle unten die passende Kategorie, um ein Ticket zu eröffnen.',
    "selectPlaceholder" TEXT NOT NULL DEFAULT '🔽 Wähle eine Kategorie ...',
    "loadTitle" TEXT NOT NULL DEFAULT '📊 Ticket Auslastung',
    "loadText" TEXT NOT NULL DEFAULT 'Hier siehst du die aktuelle Auslastung unserer Tickets. Bei einer höheren Auslastung kann es zu längeren Bearbeitungszeiten kommen. Ein Ticket kannst du jedoch jederzeit eröffnen, unabhängig von der Auslastung.',
    "openTitle" TEXT NOT NULL DEFAULT '🎫 Ticket geöffnet',
    "openText" TEXT NOT NULL DEFAULT 'Hallo {user},
vielen Dank, dass du den Support kontaktiert hast.
Beschreibe dein Anliegen möglichst genau.
Ein Teammitglied wird sich schnellstmöglich um dein Anliegen kümmern.',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_settings_pkey" PRIMARY KEY ("guildId")
);

-- AddForeignKey
ALTER TABLE "ticket_settings" ADD CONSTRAINT "ticket_settings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
