import { z } from "zod";

const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be a positive number with at most 2 decimal places")
  .refine((value) => Number.parseFloat(value) > 0, "Amount must be greater than zero");

export const createPaymentRequestSchema = z.object({
  amount: amountSchema,
  reference: z.string().trim().max(280).optional(),
  expiresInMinutes: z.coerce.number().int().min(5).max(10_080).default(1_440),
});
