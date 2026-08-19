-- AlterTable
ALTER TABLE "points_transactions" ADD COLUMN "dedupKey" TEXT;

-- CreateIndex
CREATE INDEX "points_transactions_userId_dedupKey_idx" ON "points_transactions"("userId", "dedupKey");
