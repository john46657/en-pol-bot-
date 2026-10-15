-- Automatischer ER:LC-Fahndungsabgleich. Nur neue Tabellen – bestehende Daten bleiben unverändert.

-- Anwesenheit je ER:LC-Server (aus dem Vergleich der Spielerlisten aufeinanderfolgender Abrufe)
CREATE TABLE "ErlcPlayerSession" (
    "id" UUID NOT NULL,
    "erlcServerId" UUID NOT NULL,
    "playerKey" TEXT NOT NULL,
    "robloxUserId" TEXT,
    "playerName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "ErlcPlayerSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ErlcPlayerSession_erlcServerId_leftAt_idx" ON "ErlcPlayerSession"("erlcServerId", "leftAt");
-- Höchstens eine offene Sitzung je Server + Spieler (auch bei mehreren API-Instanzen)
CREATE UNIQUE INDEX "ErlcPlayerSession_open_key" ON "ErlcPlayerSession"("erlcServerId", "playerKey") WHERE "leftAt" IS NULL;
ALTER TABLE "ErlcPlayerSession" ADD CONSTRAINT "ErlcPlayerSession_erlcServerId_fkey" FOREIGN KEY ("erlcServerId") REFERENCES "ErlcServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fahndungstreffer (dauerhafte Historie)
CREATE TABLE "WantedHit" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "wantedId" UUID NOT NULL,
    "personId" UUID,
    "erlcServerId" UUID,
    "erlcServerName" TEXT,
    "sessionId" UUID,
    "playerName" TEXT NOT NULL,
    "robloxUserId" TEXT,
    "matchType" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "matchNote" TEXT,
    "wantedReason" TEXT NOT NULL,
    "wantedPriority" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "notifyStatus" TEXT NOT NULL DEFAULT 'NONE',
    "notifyOutboxId" UUID,
    "notifyError" TEXT,
    CONSTRAINT "WantedHit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WantedHit_sessionId_wantedId_key" ON "WantedHit"("sessionId", "wantedId");
CREATE INDEX "WantedHit_serverId_detectedAt_idx" ON "WantedHit"("serverId", "detectedAt");
CREATE INDEX "WantedHit_wantedId_idx" ON "WantedHit"("wantedId");
CREATE INDEX "WantedHit_reviewStatus_idx" ON "WantedHit"("reviewStatus");
-- Sitzung darf (z. B. mit dem ER:LC-Server) entfallen – der Treffer bleibt
ALTER TABLE "WantedHit" ADD CONSTRAINT "WantedHit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ErlcPlayerSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
