import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireCsrfToken } from "../middleware/csrf";
import { requireParam } from "../lib/params";
import { writeAuditLog } from "../lib/audit";
import { AppError, NotFoundError } from "../lib/AppError";
import { requestRefundSchema, reviewRefundSchema } from "../schemas/refunds";
import { completeRefund } from "../lib/wallet";
import { PaymentStatus, RefundStatus, RoleName } from "../generated/prisma/client";

export const refundsRouter = Router();

refundsRouter.post("/payments/:id/refund-request", asyncHandler(requireAuth), requireCsrfToken, asyncHandler(async (req, res) => {
  const { reason } = requestRefundSchema.parse(req.body);
  const payment = await prisma.payment.findUnique({ where: { id: requireParam(req, "id") } });
  if (!payment || payment.payerUserId !== req.user!.id) throw new NotFoundError("Payment not found");
  if (payment.status !== PaymentStatus.COMPLETED) throw new AppError("Only completed payments can be refunded", 409);
  const existing = await prisma.refund.findUnique({ where: { paymentId: payment.id } });
  if (existing) throw new AppError("A refund already exists for this payment", 409);
  const refund = await prisma.refund.create({ data: { paymentId: payment.id, requestedByUserId: req.user!.id, amount: payment.amount, reason } });
  await writeAuditLog({ actorId: req.user!.id, actorRole: req.user!.role, action: "refund.request", targetType: "Refund", targetId: refund.id, ipAddress: req.ip });
  res.status(201).json({ refund });
}));

refundsRouter.use("/merchant", asyncHandler(requireAuth), requireRole(RoleName.MERCHANT));
refundsRouter.get("/merchant", asyncHandler(async (req, res) => {
  const merchant = await prisma.merchant.findUnique({ where: { ownerUserId: req.user!.id } });
  if (!merchant) throw new NotFoundError("Merchant profile not found");
  const refunds = await prisma.refund.findMany({ where: { payment: { merchantId: merchant.id } }, include: { payment: true }, orderBy: { createdAt: "desc" } });
  res.json({ refunds });
}));
refundsRouter.patch("/merchant/:id", requireCsrfToken, asyncHandler(async (req, res) => {
  const { action } = reviewRefundSchema.parse(req.body);
  const refund = await prisma.refund.findUnique({ where: { id: requireParam(req, "id") }, include: { payment: { include: { merchant: true } } } });
  if (!refund || refund.payment.merchant.ownerUserId !== req.user!.id) throw new NotFoundError("Refund not found");
  if (refund.status !== RefundStatus.PENDING || refund.payment.status !== PaymentStatus.COMPLETED) throw new AppError("Refund can no longer be reviewed", 409);
  if (action === "REJECT") {
    const updated = await prisma.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.REJECTED, processedAt: new Date() } });
    res.json({ refund: updated }); return;
  }
  const merchantWallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
  const payerWallet = await prisma.wallet.findUnique({ where: { userId: refund.requestedByUserId } });
  if (!merchantWallet || !payerWallet) throw new AppError("A refund wallet is unavailable", 422);
  const transactionId = await completeRefund({ refundId: refund.id, paymentId: refund.paymentId, fromWalletId: merchantWallet.id, toWalletId: payerWallet.id, amount: refund.amount.toString() });
  await writeAuditLog({ actorId: req.user!.id, actorRole: req.user!.role, action: "refund.approve", targetType: "Refund", targetId: refund.id, metadata: { transactionId }, ipAddress: req.ip });
  res.json({ transactionId });
}));
