-- Schicht-ID je Schicht (Shift-Logs wie Trident): nur neue Spalte, bestehende Sitzungen bekommen sie beim nächsten Statuswechsel
ALTER TABLE "DutySession" ADD COLUMN "shiftId" TEXT;

CREATE INDEX "DutySession_shiftId_idx" ON "DutySession"("shiftId");
