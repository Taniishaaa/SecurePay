import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireCsrfToken } from "../middleware/csrf";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import { createPaymentRequestSchema } from "../schemas/merchant";
import { writeAuditLog } from "../lib/audit";
import { NotFoundError } from "../lib/AppError";
import { MerchantStatus, RoleName } from "../generated/prisma/client";

export const merchantRouter = Router();

merchantRouter.use(asyncHandler(requireAuth), requireRole(RoleName.MERCHANT));

/** Always the caller's own merchant profile — resolved from the session, never a client-supplied id. */
async function requireOwnMerchant(userId: string) {
  const merchant = await prisma.merchant.findUnique({ where: { ownerUserId: userId } });
  if (!merchant) {
    throw new NotFoundError("No merchant profile for this account");
  }
  return merchant;
}

merchantRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const merchant = await requireOwnMerchant(req.user!.id);
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
    res.json({ merchant, wallet });
  })
);

merchantRouter.post(
  "/payment-requests",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const merchant = await requireOwnMerchant(req.user!.id);
    if (merchant.status !== MerchantStatus.ACTIVE) {
      throw new NotFoundError("Merchant profile is not active");
    }
    const { amount, reference, expiresInMinutes } = createPaymentRequestSchema.parse(req.body);

    const payment = await prisma.payment.create({
      data: { merchantId: merchant.id, amount, reference, expiresAt: new Date(Date.now() + expiresInMinutes * 60_000) },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: "payment_request.create",
      targetType: "Payment",
      targetId: payment.id,
      metadata: { amount, expiresInMinutes },
      ipAddress: req.ip,
    });

    res.status(201).json({ payment });
  })
);

merchantRouter.get(
  "/payment-requests",
  asyncHandler(async (req, res) => {
    const merchant = await requireOwnMerchant(req.user!.id);
    const pagination = parsePagination(req);
    const where = { merchantId: merchant.id };

    const [items, total] = await Promise.all([
      prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      prisma.payment.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, pagination));
  })
);
