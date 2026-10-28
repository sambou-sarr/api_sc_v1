-- Ajouter les colonnes comme nullable pour préserver les lignes existantes.
ALTER TABLE "payments"
ADD COLUMN "ficheNomSnapshot" TEXT,
ADD COLUMN "ficheSlugSnapshot" TEXT;

ALTER TABLE "subscriptions"
ADD COLUMN "ficheNomSnapshot" TEXT,
ADD COLUMN "ficheSlugSnapshot" TEXT;

-- Recuperer les informations historiques des fiches encore associees.
UPDATE "payments" AS p
SET
    "ficheNomSnapshot" = f."nom",
    "ficheSlugSnapshot" = f."slug"
FROM "fiches" AS f
WHERE p."ficheId" = f."id";

UPDATE "subscriptions" AS s
SET
    "ficheNomSnapshot" = f."nom",
    "ficheSlugSnapshot" = f."slug"
FROM "fiches" AS f
WHERE s."ficheId" = f."id";