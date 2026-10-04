-- CreateTable
CREATE TABLE "qualifications" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "grantRoleId" TEXT,
    "autoGrant" BOOLEAN NOT NULL DEFAULT false,
    "validDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualification_awards" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "qualificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeKey" TEXT,
    "awardedBy" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "override" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,
    "revokeReason" TEXT,
    "entryId" TEXT,
    "roleResult" TEXT,

    CONSTRAINT "qualification_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qualifications_guildId_name_key" ON "qualifications"("guildId", "name");

-- CreateIndex
CREATE INDEX "qualification_awards_guildId_userId_idx" ON "qualification_awards"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "qualification_awards_qualificationId_userId_activeKey_key" ON "qualification_awards"("qualificationId", "userId", "activeKey");

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualification_awards" ADD CONSTRAINT "qualification_awards_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "qualifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
