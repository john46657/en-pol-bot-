-- Funk-Whitelist: Antworten auf eigene Felder des Antragsformulars (rein additiv, nullable).
ALTER TABLE "RadioRequest" ADD COLUMN "answers" JSONB;
