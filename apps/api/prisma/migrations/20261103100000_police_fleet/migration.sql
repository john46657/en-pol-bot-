-- CreateTable
CREATE TABLE "ErlcLiveVehicle" (
    "id" UUID NOT NULL,
    "erlcServerId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerRobloxId" TEXT,
    "ownerTeam" TEXT,
    "plate" TEXT,
    "texture" TEXT,
    "colorHex" TEXT,
    "colorName" TEXT,
    "policeReason" TEXT NOT NULL,
    "uncertain" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "apiChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitId" UUID,
    "internalStatus" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "internalCode" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErlcLiveVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErlcVehicleEvent" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "incidentId" UUID,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErlcVehicleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoliceVehicleModel" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "erlcName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "internalCode" TEXT,
    "imageId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PoliceVehicleModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErlcLiveVehicle_active_idx" ON "ErlcLiveVehicle"("active");

-- CreateIndex
CREATE INDEX "ErlcLiveVehicle_unitId_idx" ON "ErlcLiveVehicle"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "ErlcLiveVehicle_erlcServerId_key_key" ON "ErlcLiveVehicle"("erlcServerId", "key");

-- CreateIndex
CREATE INDEX "ErlcVehicleEvent_vehicleId_createdAt_idx" ON "ErlcVehicleEvent"("vehicleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PoliceVehicleModel_erlcName_key" ON "PoliceVehicleModel"("erlcName");

-- AddForeignKey
ALTER TABLE "ErlcLiveVehicle" ADD CONSTRAINT "ErlcLiveVehicle_erlcServerId_fkey" FOREIGN KEY ("erlcServerId") REFERENCES "ErlcServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErlcVehicleEvent" ADD CONSTRAINT "ErlcVehicleEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "ErlcLiveVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Polizeifahrzeuge: wer das CAD sieht, sieht Fahrzeuge; Einheiten verwalten → zuweisen/bearbeiten; Einstellungen verwalten → Katalog + Konfiguration
INSERT INTO "Permission" ("key", "module") VALUES
  ('fleet.view', 'fleet'), ('fleet.view_details', 'fleet'), ('fleet.edit', 'fleet'), ('fleet.assign', 'fleet'), ('fleet.manage_catalog', 'fleet'), ('fleet.manage', 'fleet')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  ('cad.view', 'cad.*', 'fleet.view'), ('cad.view', 'cad.*', 'fleet.view_details'),
  ('cad.manage_units', 'cad.*', 'fleet.edit'), ('cad.manage_units', 'cad.*', 'fleet.assign'),
  ('settings.manage', 'settings.*', 'fleet.manage_catalog'), ('settings.manage', 'settings.*', 'fleet.manage')
) AS m(base, wildcard, perm) ON rp."permissionKey" IN (m.base, m.wildcard)
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
