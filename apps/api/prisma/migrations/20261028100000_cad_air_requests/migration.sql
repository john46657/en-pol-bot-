-- Luftunterstützung (Hubschrauber) anfordern: Koordination im CAD, gerufen wird im Spiel
CREATE TABLE "CadAirRequest" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "mode" TEXT NOT NULL,
    "target" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "incidentId" UUID,
    "requestedBy" TEXT,
    "handledBy" TEXT,
    "authorId" UUID,
    "discordId" TEXT,
    "guildId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CadAirRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CadAirRequest_status_createdAt_idx" ON "CadAirRequest"("status", "createdAt");
