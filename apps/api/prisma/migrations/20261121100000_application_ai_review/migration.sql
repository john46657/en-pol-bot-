-- KI-Bewerbungsprüfung: gespeicherte Analysen je Bewerbung (nur neue Tabelle, bestehende Daten bleiben unverändert)
CREATE TABLE "ApplicationAiReview" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "applicationId" UUID NOT NULL,
    "guildId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "inputHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "result" JSONB,
    "error" TEXT,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" UUID,
    "requestedByName" TEXT,
    "via" TEXT NOT NULL DEFAULT 'WEB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationAiReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApplicationAiReview_kind_applicationId_createdAt_idx" ON "ApplicationAiReview"("kind", "applicationId", "createdAt");
CREATE INDEX "ApplicationAiReview_createdAt_idx" ON "ApplicationAiReview"("createdAt");
