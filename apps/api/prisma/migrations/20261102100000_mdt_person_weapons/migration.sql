-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "address" TEXT,
ADD COLUMN     "appearance" JSONB,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "job" TEXT,
ADD COLUMN     "licenses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "nationality" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "photoId" UUID;

-- CreateTable
CREATE TABLE "Weapon" (
    "id" UUID NOT NULL,
    "serverId" UUID,
    "serial" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "model" TEXT,
    "ownerId" UUID,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Weapon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Weapon_serial_idx" ON "Weapon"("serial");

-- CreateIndex
CREATE INDEX "Weapon_ownerId_idx" ON "Weapon"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Weapon_serverId_serial_key" ON "Weapon"("serverId", "serial");

-- AddForeignKey
ALTER TABLE "Weapon" ADD CONSTRAINT "Weapon_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Waffenregister: wer Fahrzeuge sieht/anlegt/bearbeitet, bekommt dasselbe für Waffen
INSERT INTO "Permission" ("key", "module") VALUES ('weapons.view', 'weapons'), ('weapons.create', 'weapons'), ('weapons.edit', 'weapons')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  ('vehicles.view', 'vehicles.*', 'weapons.view'), ('vehicles.create', 'vehicles.*', 'weapons.create'), ('vehicles.edit', 'vehicles.*', 'weapons.edit')
) AS m(base, wildcard, perm) ON rp."permissionKey" IN (m.base, m.wildcard)
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
