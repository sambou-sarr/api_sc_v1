ALTER TABLE "payments" ADD COLUMN "userId" INTEGER;

UPDATE "payments" AS p
SET "userId" = f."userId"
FROM "fiches" AS f
WHERE p."ficheId" = f."id"
  AND f."userId" IS NOT NULL;

CREATE INDEX "payments_userId_createdAt_idx" ON "payments"("userId", "createdAt");

ALTER TABLE "payments"
ADD CONSTRAINT "payments_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
