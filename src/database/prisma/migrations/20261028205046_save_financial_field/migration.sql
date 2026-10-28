-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_ficheId_fkey";

-- DropForeignKey
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_ficheId_fkey";

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "ficheId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "ficheId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
