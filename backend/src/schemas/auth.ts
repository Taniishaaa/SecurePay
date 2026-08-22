import { z } from "zod";

/**
 * Strong password policy, shared by password-change now and any future
 * registration flow. Client-side hints are a UX convenience only — this is
 * the actual security boundary, enforced server-side.
 */
export const passwordPolicySchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter")
  .refine((value) => /[0-9]/.test(value), "Password must include a digit")
  .refine((value) => /[^A-Za-z0-9]/.test(value), "Password must include a special character");

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Intentionally not the strong policy here: a login attempt submits
  // whatever password the account already has, which may predate a policy
  // change. Only capped in length to keep the request/hashing cost bounded.
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordPolicySchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });
