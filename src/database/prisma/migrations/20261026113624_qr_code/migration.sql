-- CreateTable
CREATE TABLE "qr_styles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "style" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qr_styles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qr_styles_user_id_idx" ON "qr_styles"("user_id");

-- AddForeignKey
ALTER TABLE "qr_styles" ADD CONSTRAINT "qr_styles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
