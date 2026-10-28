-- CreateTable
CREATE TABLE "card_models" (
    "id" SERIAL NOT NULL,
    "tier" "PlanType" NOT NULL,
    "nom" TEXT NOT NULL,
    "rectoUrl" TEXT NOT NULL,
    "versoUrl" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_models_tier_actif_idx" ON "card_models"("tier", "actif");

-- Un seul modèle actif par formule (index unique partiel : non exprimable dans schema.prisma)
CREATE UNIQUE INDEX "card_models_one_active_per_tier" ON "card_models"("tier") WHERE "actif" = true;
