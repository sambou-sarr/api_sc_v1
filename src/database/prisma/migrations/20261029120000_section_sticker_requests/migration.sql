-- CreateEnum
CREATE TYPE "SectionStickerStatus" AS ENUM ('DEMANDE', 'ACTIVE', 'DESACTIVEE', 'REFUSEE');

-- CreateTable
CREATE TABLE "section_sticker_requests" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "userId" INTEGER,
    "section" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "message" TEXT,
    "statut" "SectionStickerStatus" NOT NULL DEFAULT 'DEMANDE',
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "section_sticker_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "section_sticker_requests_ficheId_section_idx" ON "section_sticker_requests"("ficheId", "section");

-- CreateIndex
CREATE INDEX "section_sticker_requests_statut_createdAt_idx" ON "section_sticker_requests"("statut", "createdAt");

-- AddForeignKey
ALTER TABLE "section_sticker_requests" ADD CONSTRAINT "section_sticker_requests_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_sticker_requests" ADD CONSTRAINT "section_sticker_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Une seule demande « ouverte » (DEMANDE ou ACTIVE) par fiche et par section (index unique partiel :
-- non exprimable dans schema.prisma). Une demande refusée ou désactivée peut être refaite.
CREATE UNIQUE INDEX "section_sticker_requests_open_per_section" ON "section_sticker_requests"("ficheId", "section") WHERE "statut" IN ('DEMANDE', 'ACTIVE');
