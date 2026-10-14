-- Modul-Checkliste je Ausbildung: Module an der Ausbildung, abgehakte Module je Person. Nicht destruktiv.

-- AlterTable
ALTER TABLE "HrTraining" ADD COLUMN "modules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "HrTrainingProgress" ADD COLUMN "doneModules" TEXT[] DEFAULT ARRAY[]::TEXT[];
