-- Inaktivitäts-Erinnerung für laufende Schichten
ALTER TABLE "DutySession" ADD COLUMN "lastActivityAt" TIMESTAMP(3), ADD COLUMN "remindedAt" TIMESTAMP(3);
