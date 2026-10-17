-- „Mitteilungen“ (interne Meldungen mit Lesebestätigung) und Abstimmungen entfernt – samt Daten.
-- Das Audit-Protokoll bleibt unverändert.

-- Benachrichtigungen, die auf gelöschte Meldungen/Abstimmungen zeigen
DELETE FROM "Notification" WHERE "entityType" IN ('HrAnnouncement', 'HrPoll');

-- Rechte announcements.* und polls.* (Rollen-Zuweisungen und Einzelrechte folgen per ON DELETE CASCADE)
DELETE FROM "Permission" WHERE "key" LIKE 'announcements.%' OR "key" LIKE 'polls.%';

-- DropForeignKey
ALTER TABLE "HrAnnouncementRead" DROP CONSTRAINT "HrAnnouncementRead_announcementId_fkey";

-- DropForeignKey
ALTER TABLE "HrPollVote" DROP CONSTRAINT "HrPollVote_pollId_fkey";

-- DropTable
DROP TABLE "HrAnnouncementRead";

-- DropTable
DROP TABLE "HrAnnouncement";

-- DropTable
DROP TABLE "HrPollVote";

-- DropTable
DROP TABLE "HrPoll";
