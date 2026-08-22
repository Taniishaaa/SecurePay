import assert from "node:assert/strict";
import test from "node:test";
import { topUpSchema, transferSchema } from "../src/schemas/transactions";
import { requestRefundSchema } from "../src/schemas/refunds";
import { payForPaymentSchema } from "../src/schemas/payments";

test("top-ups reject zero, negative, malformed, and over-limit amounts", () => {
  for (const amount of ["0", "-1", "100000.01", "1.999", "1e3"]) {
    assert.equal(topUpSchema.safeParse({ amount }).success, false, amount);
  }
  assert.equal(topUpSchema.safeParse({ amount: "100000.00" }).success, true);
});

test("transfers require a positive decimal amount and replay key", () => {
  for (const amount of ["0", "-500", "9999999999999"]) {
    assert.equal(transferSchema.safeParse({ recipientEmail: "bob@example.test", amount, idempotencyKey: "one" }).success, false, amount);
  }
  assert.equal(transferSchema.safeParse({ recipientEmail: "bob@example.test", amount: "500.00" }).success, false);
  assert.equal(transferSchema.safeParse({ recipientEmail: "bob@example.test", amount: "500.00", idempotencyKey: "one" }).success, true);
});

test("refund review and payment requests require non-manipulable valid inputs", () => {
  assert.equal(requestRefundSchema.safeParse({ reason: "no" }).success, false);
  assert.equal(requestRefundSchema.safeParse({ reason: "Duplicate order" }).success, true);
  assert.equal(payForPaymentSchema.safeParse({}).success, false);
  assert.equal(payForPaymentSchema.safeParse({ idempotencyKey: "payment-1" }).success, true);
});
