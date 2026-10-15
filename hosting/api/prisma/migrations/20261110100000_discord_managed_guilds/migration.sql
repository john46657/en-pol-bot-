-- Server-Übersicht nach dem Login: Discord-Server, die der Benutzer verwalten darf (aus dem Discord-Login, Scope „guilds“).
-- Nur für die Kacheln „Bot einladen“; Rechte im System ergeben sich weiterhin nur aus Mitgliedschaft und Rollen je Server.
ALTER TABLE "DiscordLink" ADD COLUMN "managedGuilds" JSONB;
ALTER TABLE "DiscordLink" ADD COLUMN "guildsSyncedAt" TIMESTAMP(3);
