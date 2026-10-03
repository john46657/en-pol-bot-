-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "discordId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WEB';

-- CreateTable
CREATE TABLE "RadioWhitelist" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "addedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadioWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RadioWhitelist_userId_key" ON "RadioWhitelist"("userId");
