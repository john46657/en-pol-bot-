-- CreateTable
CREATE TABLE "PersonnelRecord" (
    "id" UUID NOT NULL,
    "personnelId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonnelRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonnelRecord_personnelId_createdAt_idx" ON "PersonnelRecord"("personnelId", "createdAt");

-- AddForeignKey
ALTER TABLE "PersonnelRecord" ADD CONSTRAINT "PersonnelRecord_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
