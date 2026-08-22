-- Payment requests expire rather than remaining payable indefinitely. Existing
-- seeded/demo requests receive a 24-hour window from migration application.
ALTER TABLE "payments"
ADD COLUMN "expires_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
ADD COLUMN "payment_idempotency_key" TEXT;

CREATE UNIQUE INDEX "payments_payment_idempotency_key_key"
ON "payments"("payment_idempotency_key");
