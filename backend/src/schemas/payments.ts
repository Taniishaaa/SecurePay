import { z } from "zod";

export const payForPaymentSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
});
