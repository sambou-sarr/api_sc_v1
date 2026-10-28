/*
  Warnings:

  - You are about to drop the column `ficheNomSnapshot` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `ficheSlugSnapshot` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `ficheNomSnapshot` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `ficheSlugSnapshot` on the `subscriptions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "payments" DROP COLUMN "ficheNomSnapshot",
DROP COLUMN "ficheSlugSnapshot";

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "ficheNomSnapshot",
DROP COLUMN "ficheSlugSnapshot";
