CREATE TABLE "admin_action_logs" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER,
    "adminName" TEXT,
    "adminEmail" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_action_logs_createdAt_idx" ON "admin_action_logs"("createdAt");
CREATE INDEX "admin_action_logs_adminId_createdAt_idx" ON "admin_action_logs"("adminId", "createdAt");

ALTER TABLE "admin_action_logs"
ADD CONSTRAINT "admin_action_logs_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
