-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "ficheNomSnapshot" TEXT,
ADD COLUMN     "ficheSlugSnapshot" TEXT NOT NULL DEFAULT 'valeur-par-defaut';

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "ficheNomSnapshot" TEXT,
ADD COLUMN     "ficheSlugSnapshot" TEXT NOT NULL DEFAULT 'valeur-par-defaut';
