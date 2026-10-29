-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "ficheSlugSnapshot" DROP NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "ficheSlugSnapshot" DROP NOT NULL;
