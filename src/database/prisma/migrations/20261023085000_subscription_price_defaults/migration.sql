UPDATE "plans"
SET "prixMensuelFcfa" = CASE "type"
    WHEN 'PRO' THEN 2500
    WHEN 'SIGNATURE' THEN 5000
    ELSE "prixMensuelFcfa"
END
WHERE "type" IN ('PRO', 'SIGNATURE')
  AND "prixMensuelFcfa" IS NULL;

UPDATE "plans"
SET "dureeMois" = 12
WHERE "type" IN ('PRO', 'SIGNATURE')
  AND "dureeMois" IS NULL;

INSERT INTO "plan_durees" ("planId", "dureeMois", "remisePct")
SELECT plan."id", durations."dureeMois", 0
FROM "plans" AS plan
CROSS JOIN (VALUES (1), (3), (12)) AS durations("dureeMois")
WHERE plan."type" IN ('PRO', 'SIGNATURE')
ON CONFLICT ("planId", "dureeMois") DO NOTHING;
