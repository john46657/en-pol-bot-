-- Zwei-Faktor-Anmeldung (TOTP)
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT,
ADD COLUMN "totpPending" TEXT,
ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN "totpLastStep" INTEGER,
ADD COLUMN "totpRecovery" TEXT[] DEFAULT ARRAY[]::TEXT[];
