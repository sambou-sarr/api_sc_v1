CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

CREATE TABLE "lead_requests" (
    "id" SERIAL NOT NULL,
    "intent" TEXT NOT NULL,
    "intentLabel" TEXT NOT NULL,
    "products" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sector" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "company" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "prefer" TEXT,
    "message" TEXT,
    "consentMarketing" BOOLEAN NOT NULL DEFAULT false,
    "consentText" TEXT,
    "consentAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'site',
    "page" TEXT,
    "pole" TEXT,
    "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "production" TEXT,
    "delai" TEXT,
    "profil" TEXT,
    "projet" JSONB,
    "design" JSONB,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_requests_status_createdAt_idx" ON "lead_requests"("status", "createdAt");
CREATE INDEX "lead_requests_createdAt_idx" ON "lead_requests"("createdAt");
