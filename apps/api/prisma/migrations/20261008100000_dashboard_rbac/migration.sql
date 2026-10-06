-- Dashboard-Erweiterung: Rollen-Hierarchie, Discord-Verknüpfung je Rolle, Büro/Dienstnummer, persönliche Einstellungen
ALTER TABLE "Role" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "color" TEXT,
  ADD COLUMN "icon" TEXT,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "discordRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "guildId" TEXT;
ALTER TABLE "Personnel" ADD COLUMN "office" TEXT, ADD COLUMN "serviceNumber" TEXT;
CREATE UNIQUE INDEX "Personnel_serviceNumber_key" ON "Personnel"("serviceNumber");
ALTER TABLE "UserSettings" ADD COLUMN "preferences" JSONB, ADD COLUMN "layouts" JSONB;

-- Startreihenfolge: Systemadministrator ganz oben
UPDATE "Role" SET "priority" = 1 WHERE "name" = 'System Administrator';
UPDATE "Role" SET "priority" = 10 WHERE "name" = 'Police Administration';

-- Neue Bereichs-Rechte (Sichtbarkeit): bestehende Rollen behalten ihre bisherigen Menüpunkte
INSERT INTO "Permission" ("key", "module") VALUES
  ('dashboard.tickets.view', 'dashboard'), ('dashboard.applications.view', 'dashboard'), ('dashboard.team.view', 'dashboard'),
  ('dashboard.offices.view', 'dashboard'), ('dashboard.voice.view', 'dashboard'), ('dashboard.logs.view', 'dashboard'), ('dashboard.settings.view', 'dashboard')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.area, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  ('ticket.view', 'ticket.*', 'dashboard.tickets.view'),
  ('applications.view', 'applications.*', 'dashboard.applications.view'),
  ('team.view', 'team.*', 'dashboard.team.view'),
  ('team.view', 'team.*', 'dashboard.offices.view'),
  ('team.view', 'team.*', 'dashboard.voice.view'),
  ('audit.view', 'audit.*', 'dashboard.logs.view'),
  ('settings.view', 'settings.*', 'dashboard.settings.view'),
  ('roles.view', 'roles.*', 'dashboard.settings.view'),
  ('users.view', 'users.*', 'dashboard.settings.view'),
  ('studio.view', 'studio.*', 'dashboard.settings.view')
) AS m(base, wildcard, area) ON rp."permissionKey" IN (m.base, m.wildcard)
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
