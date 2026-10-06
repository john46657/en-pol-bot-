-- Funk-Codes und Team-Chance (Rechte + Bereiche)
CREATE TABLE "RadioCode" (
  "id" UUID NOT NULL,
  "guildId" TEXT,
  "code" TEXT NOT NULL,
  "meaning" TEXT NOT NULL,
  "category" TEXT,
  "description" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RadioCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RadioCode_guildId_code_key" ON "RadioCode"("guildId", "code");
CREATE INDEX "RadioCode_guildId_position_idx" ON "RadioCode"("guildId", "position");

INSERT INTO "Permission" ("key", "module") VALUES
  ('radio.view', 'radio'), ('radio.manage', 'radio'), ('teamchance.view', 'teamchance'), ('teamchance.manage', 'teamchance'),
  ('dashboard.radio.view', 'dashboard'), ('dashboard.teamchance.view', 'dashboard')
ON CONFLICT ("key") DO NOTHING;
-- bestehende Rollen: Funk-Codes sehen wie das Team, verwalten wie die Einstellungen; Team-Chance wie die Bewerbungen
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  ('team.view', 'team.*', 'radio.view'), ('team.view', 'team.*', 'dashboard.radio.view'),
  ('settings.manage', 'settings.*', 'radio.manage'),
  ('applications.view', 'applications.*', 'teamchance.view'), ('applications.view', 'applications.*', 'dashboard.teamchance.view'),
  ('applications.decide', 'applications.*', 'teamchance.manage')
) AS m(base, wildcard, perm) ON rp."permissionKey" IN (m.base, m.wildcard)
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
