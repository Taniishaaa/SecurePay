import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireCsrfToken } from "../middleware/csrf";
import { NotFoundError } from "../lib/AppError";
import { topUpSchema } from "../schemas/transactions";
import { addVirtualFunds } from "../lib/wallet";
import { writeAuditLog } from "../lib/audit";

export const walletRouter = Router();

walletRouter.use(asyncHandler(requireAuth));

/** The caller's own wallet — there is no :userId param, so there is nothing to IDOR here. */
walletRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
    if (!wallet) {
      throw new NotFoundError("This account has no wallet");
    }
    res.json({ wallet });
  })
);

/** Add simulated funds. Balances are always calculated and persisted server-side. */
walletRouter.post(
  "/top-up",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const { amount } = topUpSchema.parse(req.body);
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
    if (!wallet) {
      throw new NotFoundError("This account has no wallet");
    }

    const result = await addVirtualFunds({ walletId: wallet.id, amount });
    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: "wallet.top_up",
      targetType: "Transaction",
      targetId: result.transactionId,
      metadata: { amount },
      ipAddress: req.ip,
    });

    res.status(201).json({ transactionId: result.transactionId, balance: result.balance });
  })
);
