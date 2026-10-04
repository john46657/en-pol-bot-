-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "promotion_rules" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "rankId" TEXT NOT NULL,
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_counters" (
    "guildId" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "promotion_counters_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "promotion_requests" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fromRankId" TEXT,
    "fromRankName" TEXT,
    "toRankId" TEXT NOT NULL,
    "toRankName" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING',
    "pendingKey" TEXT,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT,
    "checks" JSONB,
    "override" BOOLEAN NOT NULL DEFAULT false,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "roleResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotion_rules_guildId_rankId_key" ON "promotion_rules"("guildId", "rankId");

-- CreateIndex
CREATE INDEX "promotion_requests_guildId_status_idx" ON "promotion_requests"("guildId", "status");

-- CreateIndex
CREATE INDEX "promotion_requests_guildId_userId_idx" ON "promotion_requests"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_requests_guildId_number_key" ON "promotion_requests"("guildId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_requests_guildId_userId_pendingKey_key" ON "promotion_requests"("guildId", "userId", "pendingKey");

-- AddForeignKey
ALTER TABLE "promotion_rules" ADD CONSTRAINT "promotion_rules_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_requests" ADD CONSTRAINT "promotion_requests_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
