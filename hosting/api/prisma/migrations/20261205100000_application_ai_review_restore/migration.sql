-- KI-Bewerbungsprüfung wieder eingeführt (jetzt auch automatisch bei neuen Bewerbungen).
-- Nicht-destruktiv: legt nur die Tabelle an, falls sie fehlt; bestehende Daten bleiben unverändert.
CREATE TABLE IF NOT EXISTS "ApplicationAiReview" (
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

CREATE INDEX IF NOT EXISTS "ApplicationAiReview_kind_applicationId_createdAt_idx" ON "ApplicationAiReview"("kind", "applicationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApplicationAiReview_createdAt_idx" ON "ApplicationAiReview"("createdAt");
