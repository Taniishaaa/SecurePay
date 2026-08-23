/*
  Warnings:

  - You are about to drop the column `expires_at` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the column `payment_idempotency_key` on the `payments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[paymentIdempotencyKey]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `expiresAt` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "payments_payment_idempotency_key_key";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "expires_at",
DROP COLUMN "payment_idempotency_key",
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "paymentIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentIdempotencyKey_key" ON "payments"("paymentIdempotencyKey");
