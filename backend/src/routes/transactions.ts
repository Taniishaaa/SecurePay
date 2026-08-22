import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireCsrfToken } from "../middleware/csrf";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import { transferSchema } from "../schemas/transactions";
import { transferFunds } from "../lib/wallet";
import { writeAuditLog } from "../lib/audit";
import { AppError, NotFoundError } from "../lib/AppError";
import { AccountStatus, TransactionType } from "../generated/prisma/client";

export const transactionsRouter = Router();

transactionsRouter.use(asyncHandler(requireAuth));

/** Own transactions only — as sender or receiver. No :userId param, so no IDOR surface. */
transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
    if (!wallet) {
      res.json(paginatedResponse([], 0, parsePagination(req)));
      return;
    }

    const pagination = parsePagination(req);
    const where = { OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }] };

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          fromWallet: { select: { user: { select: { fullName: true, email: true } } } },
          toWallet: { select: { user: { select: { fullName: true, email: true } } } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, pagination));
  })
);

/**
 * Active wallet holders suitable for the transfer recipient picker. The
 * server excludes the caller and returns no wallet IDs or account details
 * beyond what is needed to identify a selected recipient.
 */
transactionsRouter.get(
  "/recipients",
  asyncHandler(async (req, res) => {
    const recipients = await prisma.user.findMany({
      where: {
        id: { not: req.user!.id },
        accountStatus: AccountStatus.ACTIVE,
        wallet: { is: { status: "ACTIVE" } },
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true },
    });
    res.json({ recipients });
  })
);

transactionsRouter.post(
  "/transfer",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const { recipientEmail, amount, description, idempotencyKey } = transferSchema.parse(req.body);

    const senderWallet = await prisma.wallet.findUnique({ where: { userId: req.user!.id } });
    if (!senderWallet) {
      throw new NotFoundError("This account has no wallet");
    }

    if (recipientEmail === req.user!.email) {
      throw new AppError("Cannot transfer to yourself", 422);
    }

    const recipient = await prisma.user.findUnique({ where: { email: recipientEmail }, include: { wallet: true } });
    if (!recipient || !recipient.wallet) {
      throw new NotFoundError("Recipient not found");
    }
    if (recipient.accountStatus !== AccountStatus.ACTIVE) {
      throw new AppError("Recipient account is not active", 422);
    }

    const result = await transferFunds({
      fromWalletId: senderWallet.id,
      toWalletId: recipient.wallet.id,
      amount,
      type: TransactionType.TRANSFER,
      description,
      idempotencyKey,
    });

    if (!result.alreadyProcessed) {
      await writeAuditLog({
        actorId: req.user!.id,
        actorRole: req.user!.role,
        action: "transaction.transfer",
        targetType: "Transaction",
        targetId: result.transactionId,
        metadata: { recipientEmail, amount },
        ipAddress: req.ip,
      });
    }

    const updatedWallet = await prisma.wallet.findUnique({ where: { id: senderWallet.id } });

    res.status(result.alreadyProcessed ? 200 : 201).json({
      transactionId: result.transactionId,
      alreadyProcessed: result.alreadyProcessed,
      balance: updatedWallet?.balance,
    });
  })
);
