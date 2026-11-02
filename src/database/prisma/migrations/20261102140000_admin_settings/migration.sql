ALTER TABLE "users"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "app_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "platformName" TEXT NOT NULL DEFAULT 'Support Connecté',
  "supportEmail" TEXT,
  "supportPhone" TEXT,
  "socialLinks" JSONB NOT NULL DEFAULT '{}',
  "maintenance" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);
