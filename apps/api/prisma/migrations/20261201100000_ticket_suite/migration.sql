-- Ticket-System: Panels (Aktivierung, Limits, Erwähnungen, Automatik-Standardwerte), Kategorien (Zusatzpersonen, Auslastung,
-- Schließ-/Bewertungsformular, Schließungsanfrage, neue Automatisierungen), Automatik je Ticket, Team-Transkript, Bewertungsskala.
-- Rein additiv: keine Spalte/Tabelle wird gelöscht oder umbenannt, bestehende Werte bleiben unverändert.

ALTER TABLE "TicketPanel"
  ADD COLUMN IF NOT EXISTS "internalNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "channelNameFormat" TEXT,
  ADD COLUMN IF NOT EXISTS "mentionRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "maxOpen" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "automation" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "TicketCategory"
  ADD COLUMN IF NOT EXISTS "extraUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "capacityAction" TEXT NOT NULL DEFAULT 'BLOCK',
  ADD COLUMN IF NOT EXISTS "closeForm" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "ratingForm" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "closeRequestApprovers" TEXT NOT NULL DEFAULT 'CREATOR',
  ADD COLUMN IF NOT EXISTS "automationSource" TEXT NOT NULL DEFAULT 'CATEGORY',
  ADD COLUMN IF NOT EXISTS "creatorReminderMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "creatorReminderMessage" TEXT NOT NULL DEFAULT '⏰ {user}, das Team wartet auf deine Antwort in diesem Ticket.',
  ADD COLUMN IF NOT EXISTS "teamReminderMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "noResponseMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "noResponseMessage" TEXT NOT NULL DEFAULT 'Danke für deine Geduld, {user}! Das Team ist gerade ausgelastet und meldet sich so schnell wie möglich.',
  ADD COLUMN IF NOT EXISTS "closeRequestTimeoutMinutes" INTEGER NOT NULL DEFAULT 0;

-- Bisheriges Verhalten bleibt: Kapazität zeigte bisher nur an und verhinderte nichts → bestehende Kategorien mit Kapazität auf WARN.
UPDATE "TicketCategory" SET "capacityAction" = 'WARN' WHERE "capacity" > 0;

ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "automationDisabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "automationPausedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastCreatorMessageAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastStaffMessageAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "creatorRemindedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "teamRemindedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "noResponseSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closeRequestById" TEXT,
  ADD COLUMN IF NOT EXISTS "closeRequestApprovals" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "closeAnswers" JSONB NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS "SupportTicket_panelId_idx" ON "SupportTicket"("panelId");
-- Listen-Spalten: bestehende Zeilen mit leerer Liste füllen, danach wie von Prisma erwartet ohne Standardwert
ALTER TABLE "TicketPanel" ALTER COLUMN "mentionRoleIds" DROP DEFAULT;
ALTER TABLE "TicketCategory" ALTER COLUMN "extraUserIds" DROP DEFAULT;
ALTER TABLE "SupportTicket" ALTER COLUMN "closeRequestApprovals" DROP DEFAULT;

ALTER TABLE "TicketTranscript"
  ADD COLUMN IF NOT EXISTS "staffHtml" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "staffText" TEXT NOT NULL DEFAULT '';

ALTER TABLE "TicketRating"
  ADD COLUMN IF NOT EXISTS "scale" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "answers" JSONB NOT NULL DEFAULT '[]';

-- Neue Rechte; bestehende Rollen behalten ihre Fähigkeiten: Weiterleiten wie „Kategorie ändern“, Erinnern wie „Übernehmen“,
-- Automatik je Ticket wie „Status ändern“. Niemand erhält dadurch Zugriff auf Tickets, die er vorher nicht sehen durfte.
INSERT INTO "Permission" ("key", "module") VALUES ('ticket.forward', 'ticket'), ('ticket.remind', 'ticket'), ('ticket.automation', 'ticket')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey", "effect")
SELECT DISTINCT rp."roleId", m.perm, 'ALLOW'
FROM "RolePermission" rp
JOIN (VALUES ('ticket.change_category', 'ticket.forward'), ('ticket.assign', 'ticket.forward'), ('ticket.claim', 'ticket.remind'), ('ticket.change_status', 'ticket.automation'), ('ticket.manage', 'ticket.automation')) AS m(base, perm)
  ON rp."permissionKey" = m.base
WHERE rp."effect" = 'ALLOW'
ON CONFLICT DO NOTHING;
