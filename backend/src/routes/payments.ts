import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireCsrfToken } from "../middleware/csrf";
import { requireParam } from "../lib/params";
import { payForPaymentRequest } from "../lib/wallet";
import { writeAuditLog } from "../lib/audit";
import { AppError, NotFoundError } from "../lib/AppError";
import { PaymentStatus } from "../generated/prisma/client";
import { payForPaymentSchema } from "../schemas/payments";

export const paymentsRouter = Router();

paymentsRouter.use(asyncHandler(requireAuth));

async function loadPaymentWithMerchant(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { merchant: true },
  });
  if (!payment) {
    throw new NotFoundError("Payment not found");
  }
  return payment;
}

/** Pending, unexpired requests from other merchants that this user can pay. */
paymentsRouter.get(
  "/requests",
  asyncHandler(async (req, res) => {
    const now = new Date();
    await prisma.payment.updateMany({
      where: { status: PaymentStatus.PENDING, expiresAt: { lte: now } },
      data: { status: PaymentStatus.FAILED },
    });
    const payments = await prisma.payment.findMany({
      where: { status: PaymentStatus.PENDING, expiresAt: { gt: now }, merchant: { ownerUserId: { not: req.user!.id } } },
      include: { merchant: { select: { businessName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ payments });
  })
);

/** Viewable by the merchant that owns it or the user who paid it — nobody else. IDOR-safe: 404, not 403. */
paymentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const payment = await loadPaymentWithMerchant(requireParam(req, "id"));
    const isMerchantOwner = payment.merchant.ownerUserId === req.user!.id;
    const isPayer = payment.payerUserId === req.user!.id;
    if (!isMerchantOwner && !isPayer) {
      throw new NotFoundError("Payment not found");
    }
    res.json({ payment });
  })
);

/** Any authenticated account with a wallet can fulfill a pending payment request — like paying a QR/link. */
paymentsRouter.post(
  "/:id/pay",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const { idempotencyKey } = payForPaymentSchema.parse(req.body);
    const payment = await loadPaymentWithMerchant(requireParam(req, "id"));

    if (payment.status === PaymentStatus.COMPLETED && payment.paymentIdempotencyKey === idempotencyKey) {
      const payerWallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
      res.json({ transactionId: payment.transactionId, balance: payerWallet?.balance, alreadyProcessed: true });
      return;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new AppError("This payment request is no longer available", 409);
    }
    if (payment.expiresAt <= new Date()) {
      await prisma.payment.updateMany({ where: { id: payment.id, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED } });
      throw new AppError("This payment request has expired", 409);
    }
    if (payment.merchant.ownerUserId === req.user!.id) {
      throw new AppError("Cannot pay your own payment request", 422);
    }

    const payerWallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
    if (!payerWallet) {
      throw new NotFoundError("This account has no wallet");
    }
    const merchantWallet = await prisma.wallet.findUnique({ where: { userId: payment.merchant.ownerUserId } });
    if (!merchantWallet) {
      throw new NotFoundError("Merchant has no wallet");
    }

    const result = await payForPaymentRequest({
      paymentId: payment.id,
      payerWalletId: payerWallet.id,
      merchantWalletId: merchantWallet.id,
      payerUserId: req.user!.id,
      amount: payment.amount.toString(),
      description: payment.reference ?? undefined,
      idempotencyKey,
    });

    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: "payment.pay",
      targetType: "Payment",
      targetId: payment.id,
      metadata: { transactionId: result.transactionId },
      ipAddress: req.ip,
    });

    const updatedWallet = await prisma.wallet.findUnique({ where: { id: payerWallet.id } });

    res.status(result.alreadyProcessed ? 200 : 201).json({ transactionId: result.transactionId, balance: updatedWallet?.balance, alreadyProcessed: result.alreadyProcessed });
  })
);
