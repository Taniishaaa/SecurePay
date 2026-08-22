import { z } from "zod";
import { AccountStatus, MerchantStatus, RoleName } from "../generated/prisma/client";

export const updateUserSchema = z
  .object({
    accountStatus: z.nativeEnum(AccountStatus).optional(),
    role: z.nativeEnum(RoleName).optional(),
  })
  .refine((data) => data.accountStatus !== undefined || data.role !== undefined, {
    message: "Provide accountStatus and/or role to update",
  });

export const updateMerchantStatusSchema = z.object({
  status: z.nativeEnum(MerchantStatus),
});
