-- Prüfungssystem überarbeitet: Kategorien, Hinweise, Zielgruppe, Zeitfenster, Voraussetzung, Mischen, Einsicht,
-- Fragen-Schnappschuss je Versuch, markierte Fragen, Punkte je Frage, annullierte Versuche (rein additiv).
ALTER TABLE "HrExam" ADD COLUMN "instructions" TEXT;
ALTER TABLE "HrExam" ADD COLUMN "category" TEXT;
ALTER TABLE "HrExam" ADD COLUMN "reviewMode" TEXT NOT NULL DEFAULT 'ANSWERS';
ALTER TABLE "HrExam" ADD COLUMN "layout" TEXT NOT NULL DEFAULT 'PAGED';
ALTER TABLE "HrExam" ADD COLUMN "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HrExam" ADD COLUMN "shuffleOptions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HrExam" ADD COLUMN "audienceRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "HrExam" ADD COLUMN "requiredExamId" UUID;
ALTER TABLE "HrExam" ADD COLUMN "availableFrom" TIMESTAMP(3);
ALTER TABLE "HrExam" ADD COLUMN "availableUntil" TIMESTAMP(3);
ALTER TABLE "HrExam" ADD COLUMN "notifyExaminers" BOOLEAN NOT NULL DEFAULT true;
-- bisher: „Ergebnis anzeigen“ aus → keine Einsicht
UPDATE "HrExam" SET "reviewMode" = 'NONE' WHERE "showResult" = false;

ALTER TABLE "HrExamAttempt" ADD COLUMN "snapshot" JSONB;
ALTER TABLE "HrExamAttempt" ADD COLUMN "shuffle" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "HrExamAttempt" ADD COLUMN "flagged" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "HrExamAttempt" ADD COLUMN "questionScores" JSONB;
ALTER TABLE "HrExamAttempt" ADD COLUMN "voidReason" TEXT;
ALTER TABLE "HrExamAttempt" ADD COLUMN "voidedById" UUID;
ALTER TABLE "HrExamAttempt" ADD COLUMN "voidedAt" TIMESTAMP(3);
CREATE INDEX "HrExamAttempt_status_idx" ON "HrExamAttempt"("status");
