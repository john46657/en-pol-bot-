-- Automatischer ER:LC-Fahndungsabgleich. Nur neue Tabellen/Spalten – keine bestehenden Daten werden gelöscht oder geändert
-- (außer: Fahndungen ohne Nummer bekommen eine Fahndungsnummer).

-- Fahndungsnummer
ALTER TABLE "WantedRecord" ADD COLUMN "number" TEXT;
UPDATE "WantedRecord"
  SET "number" = 'F-' || to_char("createdAt", 'YYYY') || '-' || upper(substr(md5("id"::text), 1, 6))
  WHERE "number" IS NULL;
CREATE UNIQUE INDEX "WantedRecord_number_key" ON "WantedRecord"("number");

-- Stand des Abgleichs je ER:LC-Server
ALTER TABLE "ErlcServer" ADD COLUMN "wantedCheckAt" TIMESTAMP(3);
ALTER TABLE "ErlcServer" ADD COLUMN "wantedCheckError" TEXT;

-- Anwesenheit (Sitzungen) auf dem ER:LC-Server
CREATE TABLE "ErlcPlayerPresence" (
    "id" UUID NOT NULL,
    "serverId" UUID NOT NULL,
    "playerKey" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "robloxUserId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErlcPlayerPresence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErlcPlayerPresence_serverId_playerKey_key" ON "ErlcPlayerPresence"("serverId", "playerKey");
ALTER TABLE "ErlcPlayerPresence" ADD CONSTRAINT "ErlcPlayerPresence_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ErlcServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fahndungstreffer (dauerhafte Historie)
CREATE TABLE "ErlcWantedHit" (
    "id" UUID NOT NULL,
    "guildId" TEXT,
    "erlcServerId" UUID,
    "serverName" TEXT NOT NULL,
    "wantedId" UUID,
    "wantedNumber" TEXT,
    "wantedReason" TEXT NOT NULL,
    "wantedPriority" TEXT NOT NULL,
    "personId" UUID,
    "sessionId" UUID NOT NULL,
    "sessionStartedAt" TIMESTAMP(3) NOT NULL,
    "playerName" TEXT NOT NULL,
    "robloxUserId" TEXT,
    "matchType" TEXT NOT NULL,
    "identified" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" TEXT NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "notifyStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "outboxId" UUID,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ErlcWantedHit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErlcWantedHit_sessionId_wantedId_key" ON "ErlcWantedHit"("sessionId", "wantedId");
CREATE INDEX "ErlcWantedHit_guildId_detectedAt_idx" ON "ErlcWantedHit"("guildId", "detectedAt");
CREATE INDEX "ErlcWantedHit_wantedId_idx" ON "ErlcWantedHit"("wantedId");
CREATE INDEX "ErlcWantedHit_reviewStatus_idx" ON "ErlcWantedHit"("reviewStatus");
ALTER TABLE "ErlcWantedHit" ADD CONSTRAINT "ErlcWantedHit_erlcServerId_fkey" FOREIGN KEY ("erlcServerId") REFERENCES "ErlcServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ErlcWantedHit" ADD CONSTRAINT "ErlcWantedHit_wantedId_fkey" FOREIGN KEY ("wantedId") REFERENCES "WantedRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
