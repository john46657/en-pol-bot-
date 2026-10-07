-- Rechte pro Einsatz (vertraulich: nur bestimmte Rollen) und pro Einheit (wer den Status melden darf)
ALTER TABLE "Incident" ADD COLUMN "restrictRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Unit" ADD COLUMN "statusRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
