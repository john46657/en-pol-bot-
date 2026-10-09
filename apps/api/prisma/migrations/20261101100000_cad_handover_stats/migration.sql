-- CreateTable
CREATE TABLE "CadHandover" (
    "id" UUID NOT NULL,
    "guildId" TEXT,
    "createdById" UUID,
    "notes" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "acknowledgedById" UUID,
    "acknowledgedAt" TIMESTAMP(3),
    "ackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CadHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CadIncidentStat" (
    "incidentId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "guildId" TEXT,
    "dispatcherId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "units" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unitTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "CadIncidentStat_pkey" PRIMARY KEY ("incidentId")
);

-- CreateIndex
CREATE INDEX "CadHandover_createdAt_idx" ON "CadHandover"("createdAt");

-- CreateIndex
CREATE INDEX "CadIncidentStat_closedAt_idx" ON "CadIncidentStat"("closedAt");

-- CreateIndex
CREATE INDEX "CadIncidentStat_createdAt_idx" ON "CadIncidentStat"("createdAt");

-- bereits abgeschlossene (noch nicht gelöschte) Einsätze für die Statistik übernehmen
INSERT INTO "CadIncidentStat" ("incidentId", "number", "type", "priority", "status", "source", "guildId", "dispatcherId", "createdAt", "closedAt", "units", "unitTypes")
SELECT i."id", i."number", i."type", i."priority", i."status", i."source", i."guildId", i."dispatcherId", i."createdAt", i."closedAt",
  COALESCE(ARRAY(SELECT DISTINCT u."callsign" FROM "IncidentUnit" iu JOIN "Unit" u ON u."id" = iu."unitId" WHERE iu."incidentId" = i."id"), ARRAY[]::TEXT[]),
  COALESCE(ARRAY(SELECT DISTINCT u."type" FROM "IncidentUnit" iu JOIN "Unit" u ON u."id" = iu."unitId" WHERE iu."incidentId" = i."id" AND u."type" IS NOT NULL), ARRAY[]::TEXT[])
FROM "Incident" i
WHERE i."closedAt" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Rechte: Schichtübergabe (wer Einsätze anlegen darf) und Leitstellenstatistik (wer CAD-Protokolle sieht oder Einsätze abschließen darf)
INSERT INTO "Permission" ("key", "module") VALUES ('cad.handover', 'cad'), ('cad.view_stats', 'cad')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES
  ('cad.create_incident', 'cad.*', 'cad.handover'), ('cad.close_incident', 'cad.*', 'cad.view_stats'), ('cad.view_logs', 'cad.*', 'cad.view_stats')
) AS m(base, wildcard, perm) ON rp."permissionKey" IN (m.base, m.wildcard)
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
