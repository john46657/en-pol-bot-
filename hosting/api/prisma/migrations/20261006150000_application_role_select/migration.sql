-- Rollen-Auswahl-Fragen: gewählte Discord-Rollen, die bei Annahme vergeben werden
ALTER TABLE "Application" ADD COLUMN "grantRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "QualificationApplication" ADD COLUMN "grantRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
