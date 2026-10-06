-- Ticket-Funktionen wie bei GalaxyBot: Claim-Kategorie, Chat nach Übernahme, Auto-Claim/-Unclaim/-Team-Alert, Close-Request, Auslastung
ALTER TABLE "TicketCategory" ADD COLUMN "welcomeImageUrl" TEXT,
  ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "creatorCanAddUsers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "claimDiscordCategoryId" TEXT,
  ADD COLUMN "claimLocksChat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoClaimOnMessage" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoUnclaimMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "staffAlertMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "closeRequestCloses" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TicketPanel" ADD COLUMN "showLoad" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SupportTicket" ADD COLUMN "staffAlertedAt" TIMESTAMP(3), ADD COLUMN "closeRequestedAt" TIMESTAMP(3);
