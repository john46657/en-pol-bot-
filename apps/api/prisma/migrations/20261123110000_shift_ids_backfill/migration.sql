-- Ältere Schichten bekommen nachträglich eine Schicht-ID: zusammenhängende Sitzungen eines Benutzers (Ende = Beginn der nächsten)
-- bilden eine Schicht; ID = Snowflake aus dem Beginn der Schicht + Prüfsumme der ersten Sitzung. Nur Sitzungen ohne ID werden geändert.
WITH ordered AS (
  SELECT "id", "userId", "startedAt",
    CASE WHEN LAG("endedAt") OVER (PARTITION BY "userId" ORDER BY "startedAt") = "startedAt" THEN 0 ELSE 1 END AS "isStart"
  FROM "DutySession"
), grouped AS (
  SELECT "id", "userId", "startedAt", SUM("isStart") OVER (PARTITION BY "userId" ORDER BY "startedAt" ROWS UNBOUNDED PRECEDING) AS "grp"
  FROM ordered
), firsts AS (
  SELECT "id",
    FIRST_VALUE("startedAt") OVER (PARTITION BY "userId", "grp" ORDER BY "startedAt") AS "shiftStart",
    FIRST_VALUE("id") OVER (PARTITION BY "userId", "grp" ORDER BY "startedAt") AS "firstId"
  FROM grouped
)
UPDATE "DutySession" d
SET "shiftId" = ((((EXTRACT(EPOCH FROM f."shiftStart") * 1000)::bigint - 1420070400000) << 22) | (abs(hashtext(f."firstId"::text)::bigint) % 4194304))::text
FROM firsts f
WHERE d."id" = f."id" AND d."shiftId" IS NULL;
