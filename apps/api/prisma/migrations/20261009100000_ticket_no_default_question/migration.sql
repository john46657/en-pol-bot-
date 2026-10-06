-- Die automatisch angelegte Beispielfrage „Was ist dein Anliegen?“ entfernen (nur wenn sie die einzige, unveränderte Startfrage ist).
-- Selbst angelegte Fragen bleiben unberührt.
UPDATE "TicketCategory"
SET "questions" = '[]'::jsonb
WHERE jsonb_typeof("questions") = 'array'
  AND jsonb_array_length("questions") = 1
  AND "questions"->0->>'id' = 'q1'
  AND "questions"->0->>'label' = 'Was ist dein Anliegen?';
