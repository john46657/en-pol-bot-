-- Verlängerungsanträge für Abmeldungen (wie Trident „Extend“): offene Verlängerung bis zur Entscheidung der Leitung
ALTER TABLE "LeaveRequest" ADD COLUMN "extensionMinutes" INTEGER;
ALTER TABLE "LeaveRequest" ADD COLUMN "extensionReason" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "extensionRequestedAt" TIMESTAMP(3);
