-- Ticket-Kategorien und -Panels je Discord-Server (leer = alle Server)
ALTER TABLE "TicketPanel" ADD COLUMN "guildId" TEXT;
ALTER TABLE "TicketCategory" ADD COLUMN "guildId" TEXT;
