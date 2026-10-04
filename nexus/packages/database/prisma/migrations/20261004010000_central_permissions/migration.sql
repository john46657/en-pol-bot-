-- Phase 6: Zentrales Permission-System. Die Zuordnung Rolle → Permissions liegt nur noch in der
-- Tabelle "permissions". Bestehende Daten aus "guilds"."rolePermissions" werden übernommen.

-- 1) Rollen anlegen, die noch nicht gespiegelt sind (als gelöscht markiert; der Bot-Sync reaktiviert sie,
--    falls die Rolle auf Discord existiert).
INSERT INTO "discord_roles" ("id", "guildId", "discordId", "name", "deletedAt", "createdAt", "updatedAt")
SELECT 'mig' || substr(md5(g."id" || e.key || random()::text), 1, 22), g."id", e.key, 'Unbekannte Rolle', now(), now(), now()
FROM "guilds" g
CROSS JOIN LATERAL jsonb_each(g."rolePermissions") e
WHERE g."rolePermissions" IS NOT NULL
  AND jsonb_typeof(g."rolePermissions") = 'object'
  AND jsonb_typeof(e.value) = 'array'
ON CONFLICT ("guildId", "discordId") DO NOTHING;

-- 2) Permission-Zuordnungen übernehmen.
INSERT INTO "permissions" ("id", "guildId", "key", "roleId", "createdAt")
SELECT 'mig' || substr(md5(g."id" || e.key || p.value::text || random()::text), 1, 22), g."id", p.value #>> '{}', r."id", now()
FROM "guilds" g
CROSS JOIN LATERAL jsonb_each(g."rolePermissions") e
CROSS JOIN LATERAL jsonb_array_elements(e.value) p
JOIN "discord_roles" r ON r."guildId" = g."id" AND r."discordId" = e.key
WHERE g."rolePermissions" IS NOT NULL
  AND jsonb_typeof(g."rolePermissions") = 'object'
  AND jsonb_typeof(e.value) = 'array'
  AND jsonb_typeof(p.value) = 'string'
ON CONFLICT ("guildId", "key", "roleId") DO NOTHING;

-- 3) Altes Feld entfernen.
ALTER TABLE "guilds" DROP COLUMN "rolePermissions";
