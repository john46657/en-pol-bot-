-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "discordName" TEXT,
ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "joinedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QualificationApplication" ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "joinedAt" TIMESTAMP(3);
