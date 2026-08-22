import { z } from "zod";

/** Matches an unsigned decimal with up to 2 fraction digits — Decimal(14,2) in the schema. */
const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be a positive number with at most 2 decimal places")
  .refine((value) => Number.parseFloat(value) > 0, "Amount must be greater than zero");

// This is deliberately a per-request cap rather than a client-side-only UI
// restriction. It keeps the shared demo useful without allowing a single
// request to create an unrealistic balance.
const topUpAmountSchema = amountSchema.refine(
  (value) => Number.parseFloat(value) <= 100_000,
  "Amount cannot exceed ₹100,000.00 per top-up"
);

export const transferSchema = z.object({
  recipientEmail: z.string().trim().toLowerCase().email().max(254),
  amount: amountSchema,
  description: z.string().trim().max(280).optional(),
  // Required for every transfer. A retry with the same key returns the
  // original transaction instead of moving money twice.
  idempotencyKey: z.string().trim().min(1).max(128),
});

export const topUpSchema = z.object({
  amount: topUpAmountSchema,
});
