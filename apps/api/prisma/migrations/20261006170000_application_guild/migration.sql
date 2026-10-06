-- Discord-Server, auf dem eine Bewerbung gestartet wurde (Anzeige/Filter im Dashboard)
ALTER TABLE "Application" ADD COLUMN "guildId" TEXT;
ALTER TABLE "QualificationApplication" ADD COLUMN "guildId" TEXT;
