-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "prixMensuelFcfa" INTEGER;

-- CreateTable
CREATE TABLE "plan_durees" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "dureeMois" INTEGER NOT NULL,
    "remisePct" INTEGER NOT NULL,

    CONSTRAINT "plan_durees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_remises" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "quantiteMin" INTEGER NOT NULL,
    "remisePct" INTEGER NOT NULL,

    CONSTRAINT "plan_remises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emplacement_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "prixUnitaireFcfa" INTEGER,

    CONSTRAINT "emplacement_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emplacement_packs" (
    "id" SERIAL NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixFcfa" INTEGER NOT NULL,

    CONSTRAINT "emplacement_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_durees_planId_dureeMois_key" ON "plan_durees"("planId", "dureeMois");

-- CreateIndex
CREATE UNIQUE INDEX "plan_remises_planId_quantiteMin_key" ON "plan_remises"("planId", "quantiteMin");

-- CreateIndex
CREATE UNIQUE INDEX "emplacement_packs_quantite_key" ON "emplacement_packs"("quantite");

-- AddForeignKey
ALTER TABLE "plan_durees" ADD CONSTRAINT "plan_durees_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_remises" ADD CONSTRAINT "plan_remises_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
