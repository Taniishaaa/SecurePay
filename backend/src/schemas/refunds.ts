import { z } from "zod";

export const requestRefundSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const reviewRefundSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
});
