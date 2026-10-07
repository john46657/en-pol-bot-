-- CreateTable
CREATE TABLE "EditLock" (
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditLock_pkey" PRIMARY KEY ("entityType","entityId")
);

-- CreateIndex
CREATE INDEX "EditLock_userId_idx" ON "EditLock"("userId");

-- AddForeignKey
ALTER TABLE "EditLock" ADD CONSTRAINT "EditLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

