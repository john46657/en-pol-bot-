-- CreateTable
CREATE TABLE "AIProposal" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "rationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIProposal_requesterId_status_idx" ON "AIProposal"("requesterId", "status");
