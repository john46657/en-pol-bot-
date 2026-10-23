-- KI-Bewerbungsprüfung (Google Gemini) entfernt: gespeicherte Analysen und Einstellungen löschen.
DROP TABLE IF EXISTS "ApplicationAiReview";
DELETE FROM "SystemSetting" WHERE "key" = 'applications.aiReview' OR "key" LIKE 'applications.aiReview@%';
