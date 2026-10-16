-- Funk-Whitelist mit externem Funkdienst (rein ADDITIV – nichts wird gelöscht oder verändert).
-- Plan und Rückweg: docs/radio-whitelist.md („Migrationsplan“). Die bisherige Tabelle "RadioWhitelist" bleibt unverändert erhalten.

-- CreateTable
CREATE TABLE "RadioGrant" (
    "id" UUID NOT NULL,
    "discordId" TEXT,
    "discordName" TEXT,
    "userId" UUID,
    "rank" TEXT,
    "department" TEXT,
    "externalName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "suspendedUntil" TIMESTAMP(3),
    "suspendReason" TEXT,
    "statusBeforeSuspend" TEXT,
    "roleRevoked" BOOLEAN NOT NULL DEFAULT false,
    "grantedById" UUID,
    "grantedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "externalStatus" TEXT NOT NULL DEFAULT 'NONE',
    "externalSyncedAt" TIMESTAMP(3),
    "externalError" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadioGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadioRequest" (
    "id" UUID NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordName" TEXT,
    "guildId" TEXT,
    "rank" TEXT,
    "department" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "grantExpiresAt" TIMESTAMP(3),
    "grantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadioRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadioIntegration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL DEFAULT 'NONE',
    "displayName" TEXT NOT NULL DEFAULT 'Funkdienst',
    "network" TEXT,
    "channel" TEXT,
    "adminUsername" TEXT,
    "passwordEnc" TEXT,
    "apiKeyEnc" TEXT,
    "autoSync" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastTestAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastError" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadioIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RadioGrant_discordId_key" ON "RadioGrant"("discordId");

-- CreateIndex
CREATE INDEX "RadioGrant_status_idx" ON "RadioGrant"("status");

-- CreateIndex
CREATE INDEX "RadioGrant_expiresAt_idx" ON "RadioGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "RadioGrant_userId_idx" ON "RadioGrant"("userId");

-- CreateIndex
CREATE INDEX "RadioRequest_status_createdAt_idx" ON "RadioRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RadioRequest_discordId_idx" ON "RadioRequest"("discordId");


-- Alt-Einträge ohne Discord-ID (Konto nicht mit Discord verknüpft): höchstens einer je Benutzer
CREATE UNIQUE INDEX "RadioGrant_userId_without_discord_key" ON "RadioGrant"("userId") WHERE "discordId" IS NULL;

-- Bisherige Funk-Whitelist übernehmen (je Benutzer der älteste Eintrag; Discord-ID aus der Verknüpfung, falls vorhanden).
-- Idempotent: läuft die Migration erneut, entstehen keine Doppel (Discord-ID bzw. Benutzer eindeutig).
INSERT INTO "RadioGrant" ("id", "discordId", "discordName", "userId", "status", "source", "reason", "grantedById", "grantedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), dl."discordId", u."displayName", w."userId", 'ACTIVE', 'LEGACY', 'Übernommen aus der bisherigen Funk-Whitelist', w."addedById", w."createdAt", w."createdAt", CURRENT_TIMESTAMP
FROM (SELECT DISTINCT ON ("userId") * FROM "RadioWhitelist" ORDER BY "userId", "createdAt") w
JOIN "User" u ON u."id" = w."userId"
LEFT JOIN "DiscordLink" dl ON dl."userId" = w."userId"
WHERE NOT EXISTS (SELECT 1 FROM "RadioGrant" g WHERE g."userId" = w."userId" OR (dl."discordId" IS NOT NULL AND g."discordId" = dl."discordId"))
ON CONFLICT DO NOTHING;

INSERT INTO "RadioIntegration" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- Rechte (deny-by-default). Damit bisherige Möglichkeiten nicht wegfallen: wer die Whitelist bisher ändern durfte
-- (personnel.edit), darf sie weiterhin ansehen, freischalten und entfernen. Alles Weitere muss ausdrücklich vergeben werden.
INSERT INTO "Permission" ("key", "module") VALUES
  ('radiowhitelist.view', 'radiowhitelist'), ('radiowhitelist.grant', 'radiowhitelist'), ('radiowhitelist.suspend', 'radiowhitelist'),
  ('radiowhitelist.remove', 'radiowhitelist'), ('radiowhitelist.requests', 'radiowhitelist'), ('radiowhitelist.roles', 'radiowhitelist'),
  ('radiowhitelist.integration', 'radiowhitelist'), ('radiowhitelist.logs', 'radiowhitelist')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES ('radiowhitelist.view'), ('radiowhitelist.grant'), ('radiowhitelist.remove')) AS m(perm) ON TRUE
WHERE rp."effect" = 'ALLOW' AND rp."permissionKey" IN ('personnel.edit', 'personnel.*')
ON CONFLICT DO NOTHING;
