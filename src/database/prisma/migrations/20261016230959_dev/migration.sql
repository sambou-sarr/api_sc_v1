-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('ESSENTIELLE', 'PRO', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "StatutFiche" AS ENUM ('ACTIVE', 'SUSPENDUE');

-- CreateEnum
CREATE TYPE "Secteur" AS ENUM ('RESTAURANT', 'IMMOBILIER', 'COMMERCE', 'HOTEL', 'INDEPENDANT', 'BEAUTE');

-- CreateEnum
CREATE TYPE "PremierBouton" AS ENUM ('WHATSAPP', 'APPEL', 'EMAIL');

-- CreateEnum
CREATE TYPE "Disposition" AS ENUM ('PORTRAIT', 'LOGO', 'BANNIERE', 'DUO');

-- CreateEnum
CREATE TYPE "Taille" AS ENUM ('S', 'M', 'L');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('OR', 'CLAIR', 'BLEU', 'NUIT');

-- CreateEnum
CREATE TYPE "TabType" AS ENUM ('PRESENTATION', 'MENU', 'BIENS', 'CATALOGUE', 'GALERIE', 'VIDEOS', 'LIENS', 'RENDEZVOUS', 'RAPPEL', 'HORAIRES', 'AVIS', 'RESEAUX', 'LOCALISATION', 'TEXTE');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "BienType" AS ENUM ('VENTE', 'LOCATION');

-- CreateEnum
CREATE TYPE "PrintStatus" AS ENUM ('A_IMPRIMER', 'IMPRIMEE', 'ENCODEE', 'TESTEE', 'LIVREE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "StickerKind" AS ENUM ('FONCTION', 'TELEPHONE');

-- CreateEnum
CREATE TYPE "StickerFonction" AS ENUM ('AVIS', 'WIFI', 'MENU', 'RESEAUX', 'CONTACT', 'RDV', 'LIEN');

-- CreateEnum
CREATE TYPE "StickerStatus" AS ENUM ('A_PARAMETRER', 'PARAMETRE', 'TESTE', 'IMPRIME', 'LIVRE', 'ANNULE');

-- CreateEnum
CREATE TYPE "QrMode" AS ENUM ('DYNAMIQUE', 'WIFI', 'FICHE');

-- CreateTable
CREATE TABLE "fiches" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL DEFAULT '',
    "fonction" TEXT,
    "entreprise" TEXT,
    "photo" TEXT,
    "logo" TEXT,
    "telephone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "site" TEXT,
    "adresse" TEXT,
    "googlePlaceId" TEXT,
    "premierBouton" "PremierBouton" NOT NULL DEFAULT 'WHATSAPP',
    "messageWhatsapp" TEXT,
    "statut" "StatutFiche" NOT NULL DEFAULT 'ACTIVE',
    "enLigneSeule" BOOLEAN NOT NULL DEFAULT false,
    "scansTotal" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER,
    "claimCode" TEXT,
    "secteur" "Secteur",
    "presentation" TEXT,
    "rdvLabel" TEXT,
    "rdvUrl" TEXT,
    "enteteDisposition" "Disposition" NOT NULL DEFAULT 'PORTRAIT',
    "enteteTaille" "Taille" NOT NULL DEFAULT 'M',
    "enteteTheme" "Theme",
    "enteteCouverture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiche_onglets" (
    "id" TEXT NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "type" "TabType" NOT NULL,
    "titre" TEXT,
    "contenu" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,

    CONSTRAINT "fiche_onglets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiche_reseaux" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fiche_reseaux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiche_liens" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fiche_liens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiche_horaires" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "jour" INTEGER NOT NULL,
    "horaire" TEXT NOT NULL,

    CONSTRAINT "fiche_horaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiche_medias" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fiche_medias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_sections" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalogue_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogue_articles" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "photo" TEXT,
    "prix" INTEGER,
    "badge" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalogue_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_sections" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_plats" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "prix" INTEGER,
    "description" TEXT,
    "image" TEXT,
    "video" TEXT,
    "videoWebm" TEXT,
    "badge" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_plats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biens" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "type" "BienType" NOT NULL,
    "prix" INTEGER,
    "periode" TEXT,
    "ville" TEXT,
    "surface" INTEGER,
    "terrain" INTEGER,
    "chambres" INTEGER,
    "sdb" INTEGER,
    "atouts" TEXT[],
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "biens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bien_photos" (
    "id" SERIAL NOT NULL,
    "bienId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bien_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "nom" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "type" "PlanType" NOT NULL,
    "nom" TEXT NOT NULL,
    "themeDefaut" "Theme" NOT NULL,
    "prixFcfa" INTEGER,
    "dureeMois" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_limits" (
    "planId" INTEGER NOT NULL,
    "tabsAutorises" "TabType"[],
    "headerLayouts" "Disposition"[],
    "themes" "Theme"[],
    "canReorder" BOOLEAN NOT NULL DEFAULT false,
    "canHide" BOOLEAN NOT NULL DEFAULT false,
    "canAdd" BOOLEAN NOT NULL DEFAULT false,
    "canRename" BOOLEAN NOT NULL DEFAULT false,
    "maxCustomTabs" INTEGER NOT NULL DEFAULT 0,
    "maxPresentation" INTEGER NOT NULL,
    "maxSocial" INTEGER NOT NULL,
    "maxLinks" INTEGER NOT NULL,
    "maxPhotos" INTEGER NOT NULL,
    "maxVideos" INTEGER NOT NULL,
    "maxCatalogSections" INTEGER NOT NULL DEFAULT 0,
    "maxCatalogArticlesPerSection" INTEGER NOT NULL DEFAULT 0,
    "catalogPrices" BOOLEAN NOT NULL DEFAULT false,
    "maxMenuSections" INTEGER NOT NULL DEFAULT 0,
    "maxMenuItemsPerSection" INTEGER NOT NULL DEFAULT 0,
    "menuVideoPerItem" BOOLEAN NOT NULL DEFAULT false,
    "maxMenuVideoSeconds" INTEGER NOT NULL DEFAULT 0,
    "maxBiens" INTEGER NOT NULL DEFAULT 0,
    "maxPhotosPerBien" INTEGER NOT NULL DEFAULT 0,
    "hasCatalog" BOOLEAN NOT NULL DEFAULT false,
    "hasMenu" BOOLEAN NOT NULL DEFAULT false,
    "hasBiens" BOOLEAN NOT NULL DEFAULT false,
    "hasGoogleReview" BOOLEAN NOT NULL DEFAULT false,
    "hasStats" BOOLEAN NOT NULL DEFAULT false,
    "hasForm" BOOLEAN NOT NULL DEFAULT false,
    "hasDashboard" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("planId")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "amountFcfa" INTEGER,
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER,
    "tier" "PlanType",
    "formule" TEXT,
    "slug" TEXT,
    "nfcUrl" TEXT NOT NULL,
    "design" JSONB,
    "rectoPath" TEXT,
    "versoPath" TEXT,
    "statut" "PrintStatus" NOT NULL DEFAULT 'A_IMPRIMER',
    "clientNom" TEXT,
    "clientEntreprise" TEXT,
    "clientTelephone" TEXT,
    "clientEmail" TEXT,
    "clientFonction" TEXT,
    "printedAt" TIMESTAMP(3),
    "testedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "rectoUrl" TEXT,
    "versoUrl" TEXT,
    "encodedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_orders" (
    "id" SERIAL NOT NULL,
    "ficheId" INTEGER,
    "kind" "StickerKind" NOT NULL,
    "fonction" "StickerFonction",
    "tailleMm" INTEGER NOT NULL,
    "forme" TEXT,
    "theme" TEXT,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "options" JSONB,
    "parametres" JSONB,
    "personnalisation" JSONB,
    "qrMode" "QrMode" NOT NULL,
    "qrCode" TEXT,
    "ficheSlug" TEXT,
    "statut" "StickerStatus" NOT NULL DEFAULT 'A_PARAMETRER',
    "clientNom" TEXT,
    "clientEntreprise" TEXT,
    "clientTelephone" TEXT,
    "clientEmail" TEXT,
    "clientFonction" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sticker_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_links" (
    "code" TEXT NOT NULL,
    "targetUrl" TEXT,
    "label" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "scans" INTEGER NOT NULL DEFAULT 0,
    "lastScanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stickerId" INTEGER,

    CONSTRAINT "qr_links_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiches_slug_key" ON "fiches"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "fiches_claimCode_key" ON "fiches"("claimCode");

-- CreateIndex
CREATE INDEX "fiches_userId_idx" ON "fiches"("userId");

-- CreateIndex
CREATE INDEX "fiches_statut_idx" ON "fiches"("statut");

-- CreateIndex
CREATE INDEX "fiche_onglets_ficheId_position_idx" ON "fiche_onglets"("ficheId", "position");

-- CreateIndex
CREATE INDEX "fiche_reseaux_ficheId_idx" ON "fiche_reseaux"("ficheId");

-- CreateIndex
CREATE INDEX "fiche_liens_ficheId_idx" ON "fiche_liens"("ficheId");

-- CreateIndex
CREATE UNIQUE INDEX "fiche_horaires_ficheId_jour_key" ON "fiche_horaires"("ficheId", "jour");

-- CreateIndex
CREATE INDEX "fiche_medias_ficheId_position_idx" ON "fiche_medias"("ficheId", "position");

-- CreateIndex
CREATE INDEX "catalogue_sections_ficheId_position_idx" ON "catalogue_sections"("ficheId", "position");

-- CreateIndex
CREATE INDEX "catalogue_articles_sectionId_position_idx" ON "catalogue_articles"("sectionId", "position");

-- CreateIndex
CREATE INDEX "menu_sections_ficheId_position_idx" ON "menu_sections"("ficheId", "position");

-- CreateIndex
CREATE INDEX "menu_plats_sectionId_position_idx" ON "menu_plats"("sectionId", "position");

-- CreateIndex
CREATE INDEX "biens_ficheId_position_idx" ON "biens"("ficheId", "position");

-- CreateIndex
CREATE INDEX "bien_photos_bienId_position_idx" ON "bien_photos"("bienId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "plans_type_key" ON "plans"("type");

-- CreateIndex
CREATE INDEX "subscriptions_ficheId_status_idx" ON "subscriptions"("ficheId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_endsAt_idx" ON "subscriptions"("endsAt");

-- CreateIndex
CREATE INDEX "print_jobs_statut_createdAt_idx" ON "print_jobs"("statut", "createdAt");

-- CreateIndex
CREATE INDEX "print_jobs_ficheId_idx" ON "print_jobs"("ficheId");

-- CreateIndex
CREATE INDEX "sticker_orders_kind_statut_createdAt_idx" ON "sticker_orders"("kind", "statut", "createdAt");

-- CreateIndex
CREATE INDEX "sticker_orders_qrCode_idx" ON "sticker_orders"("qrCode");

-- CreateIndex
CREATE INDEX "qr_links_stickerId_idx" ON "qr_links"("stickerId");

-- AddForeignKey
ALTER TABLE "fiches" ADD CONSTRAINT "fiches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiche_onglets" ADD CONSTRAINT "fiche_onglets_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiche_reseaux" ADD CONSTRAINT "fiche_reseaux_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiche_liens" ADD CONSTRAINT "fiche_liens_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiche_horaires" ADD CONSTRAINT "fiche_horaires_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiche_medias" ADD CONSTRAINT "fiche_medias_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_sections" ADD CONSTRAINT "catalogue_sections_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogue_articles" ADD CONSTRAINT "catalogue_articles_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "catalogue_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_plats" ADD CONSTRAINT "menu_plats_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "menu_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biens" ADD CONSTRAINT "biens_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bien_photos" ADD CONSTRAINT "bien_photos_bienId_fkey" FOREIGN KEY ("bienId") REFERENCES "biens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_orders" ADD CONSTRAINT "sticker_orders_ficheId_fkey" FOREIGN KEY ("ficheId") REFERENCES "fiches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_links" ADD CONSTRAINT "qr_links_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "sticker_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
