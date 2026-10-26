CREATE TYPE "FichePurchaseStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

ALTER TABLE "payments" ADD COLUMN "dureeMois" INTEGER;

CREATE TABLE "fiche_purchases" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "freeQuantity" INTEGER NOT NULL DEFAULT 0,
    "dureeMois" INTEGER,
    "amountFcfa" INTEGER NOT NULL,
    "status" "FichePurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "fiche_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fiche_purchases_reference_key" ON "fiche_purchases"("reference");
CREATE INDEX "fiche_purchases_userId_status_expiresAt_idx" ON "fiche_purchases"("userId", "status", "expiresAt");

ALTER TABLE "fiche_purchases" ADD CONSTRAINT "fiche_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiche_purchases" ADD CONSTRAINT "fiche_purchases_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "plan_durees" ("planId", "dureeMois", "remisePct")
SELECT "id", "dureeMois", 0
FROM "plans"
WHERE "dureeMois" IS NOT NULL
ON CONFLICT ("planId", "dureeMois") DO NOTHING;

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

INSERT INTO "emplacement_config" ("id", "prixUnitaireFcfa")
VALUES (1, 1000)
ON CONFLICT ("id") DO UPDATE
SET "prixUnitaireFcfa" = 1000
WHERE "emplacement_config"."prixUnitaireFcfa" IS NULL;
