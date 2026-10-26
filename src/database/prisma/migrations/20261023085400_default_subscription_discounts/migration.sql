INSERT INTO "plan_durees" ("planId", "dureeMois", "remisePct")
SELECT plan."id", durations."dureeMois", durations."remisePct"
FROM "plans" AS plan
CROSS JOIN (VALUES (1, 0), (3, 10), (12, 20)) AS durations("dureeMois", "remisePct")
WHERE plan."type" IN ('PRO', 'SIGNATURE')
ON CONFLICT ("planId", "dureeMois") DO NOTHING;

UPDATE "plan_durees" AS configured
SET "remisePct" = CASE configured."dureeMois"
    WHEN 1 THEN 0
    WHEN 3 THEN 10
    WHEN 12 THEN 20
END
FROM "plans" AS plan
WHERE configured."planId" = plan."id"
  AND plan."type" IN ('PRO', 'SIGNATURE')
  AND configured."dureeMois" IN (1, 3, 12)
  AND configured."remisePct" = 0
  AND NOT EXISTS (
      SELECT 1
      FROM "plan_durees" AS existing
      WHERE existing."planId" = configured."planId"
        AND existing."remisePct" > 0
  );

INSERT INTO "plan_remises" ("planId", "quantiteMin", "remisePct")
SELECT plan."id", tiers."quantiteMin", tiers."remisePct"
FROM "plans" AS plan
CROSS JOIN (VALUES (10, 10), (50, 20)) AS tiers("quantiteMin", "remisePct")
WHERE plan."type" IN ('PRO', 'SIGNATURE')
  AND NOT EXISTS (
      SELECT 1
      FROM "plan_remises" AS configured
      WHERE configured."planId" = plan."id"
  )
ON CONFLICT ("planId", "quantiteMin") DO NOTHING;
