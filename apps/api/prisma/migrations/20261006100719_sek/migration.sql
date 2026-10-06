-- CreateTable
CREATE TABLE "SekMember" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "addedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SekMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SekReport" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "authorId" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "missionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SekReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SekApplication" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "serviceTime" TEXT NOT NULL,
    "motivation" TEXT NOT NULL,
    "experience" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SekApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SekMember_userId_key" ON "SekMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SekReport_number_key" ON "SekReport"("number");

-- CreateIndex
CREATE INDEX "SekReport_createdAt_idx" ON "SekReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SekApplication_number_key" ON "SekApplication"("number");

-- CreateIndex
CREATE INDEX "SekApplication_userId_status_idx" ON "SekApplication"("userId", "status");
