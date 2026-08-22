-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_payerUserId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_transactionId_fkey";

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "payerUserId" DROP NOT NULL,
ALTER COLUMN "transactionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
