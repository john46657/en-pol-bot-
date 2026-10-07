-- Entscheidungszeitpunkt der Polizei-Bewerbungen (Statistik); bestehende Entscheidungen: letzte Änderung als Näherung
ALTER TABLE "Application" ADD COLUMN "decidedAt" TIMESTAMP(3);
UPDATE "Application" SET "decidedAt" = "updatedAt" WHERE "status" IN ('ACCEPTED', 'REJECTED');
