import { prisma } from "./prisma";
import { AppError } from "./AppError";
import { Prisma, TransactionStatus, TransactionType, WalletStatus, PaymentStatus } from "../generated/prisma/client";

interface TransferParams {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  type: TransactionType;
  description?: string;
  idempotencyKey?: string;
}

export interface TransferResult {
  transactionId: string;
  /** True if a Transaction with this idempotencyKey already existed — nothing new was moved. */
  alreadyProcessed: boolean;
}

export interface TopUpResult {
  transactionId: string;
  balance: Prisma.Decimal;
}

/** Internal-only signal to retry after losing an optimistic-concurrency race — never escapes this module. */
class ConcurrencyConflict extends Error {}

const MAX_RETRIES = 3;

/**
 * The one place money actually moves: debits one wallet, credits another,
 * and writes the Transaction, using an optimistic-concurrency check
 * (Wallet.version) on both updates. Takes a Prisma transaction client so
 * callers can compose additional atomic writes (e.g. claiming a Payment
 * request) into the same all-or-nothing DB transaction — see
 * `payForPaymentRequest` below for why that matters.
 */
async function coreTransfer(tx: Prisma.TransactionClient, params: TransferParams) {
  if (params.fromWalletId === params.toWalletId) {
    throw new AppError("Cannot transfer to the same wallet", 422);
  }

  const amount = new Prisma.Decimal(params.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new AppError("Amount must be greater than zero", 422);
  }

  const [fromWallet, toWallet] = await Promise.all([
    tx.wallet.findUniqueOrThrow({ where: { id: params.fromWalletId } }),
    tx.wallet.findUniqueOrThrow({ where: { id: params.toWalletId } }),
  ]);

  if (fromWallet.status !== WalletStatus.ACTIVE) {
    throw new AppError("Sender wallet is not active", 422);
  }
  if (toWallet.status !== WalletStatus.ACTIVE) {
    throw new AppError("Recipient wallet is not active", 422);
  }
  if (fromWallet.balance.lessThan(amount)) {
    throw new AppError("Insufficient balance", 422);
  }

  const debit = await tx.wallet.updateMany({
    where: { id: fromWallet.id, version: fromWallet.version },
    data: { balance: { decrement: amount }, version: { increment: 1 } },
  });
  if (debit.count === 0) throw new ConcurrencyConflict();

  const credit = await tx.wallet.updateMany({
    where: { id: toWallet.id, version: toWallet.version },
    data: { balance: { increment: amount }, version: { increment: 1 } },
  });
  if (credit.count === 0) throw new ConcurrencyConflict();

  return tx.transaction.create({
    data: {
      fromWalletId: fromWallet.id,
      toWalletId: toWallet.id,
      amount,
      type: params.type,
      status: TransactionStatus.COMPLETED,
      idempotencyKey: params.idempotencyKey,
      description: params.description,
    },
  });
}

async function withConflictRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ConcurrencyConflict) {
        continue;
      }
      throw error;
    }
  }
  throw new AppError("Could not complete the transfer due to concurrent updates. Please try again.", 409);
}

/** Plain wallet-to-wallet transfer (P2P sends). */
export async function transferFunds(params: TransferParams): Promise<TransferResult> {
  if (params.idempotencyKey) {
    const existing = await prisma.transaction.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
    if (existing) {
      return { transactionId: existing.id, alreadyProcessed: true };
    }
  }

  try {
    const transactionId = await withConflictRetry(() =>
      prisma.$transaction((tx) => coreTransfer(tx, params).then((transaction) => transaction.id))
    );

    return { transactionId, alreadyProcessed: false };
  } catch (error) {
    // Two identical requests can both pass the initial lookup before either
    // transaction commits. The unique DB constraint is the final replay
    // barrier; return the committed transfer rather than exposing a 500.
    if (params.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.transaction.findUnique({ where: { idempotencyKey: params.idempotencyKey } });
      if (existing) {
        return { transactionId: existing.id, alreadyProcessed: true };
      }
    }
    throw error;
  }
}

/**
 * Credits virtual funds to one active wallet and records the credit as an
 * immutable transaction. The version predicate makes the read/modify/write
 * sequence safe when several top-ups are submitted at the same time.
 */
export async function addVirtualFunds(params: { walletId: string; amount: string }): Promise<TopUpResult> {
  const amount = new Prisma.Decimal(params.amount);
  if (amount.lessThanOrEqualTo(0)) {
    throw new AppError("Amount must be greater than zero", 422);
  }

  return withConflictRetry(() =>
    prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: params.walletId } });
      if (wallet.status !== WalletStatus.ACTIVE) {
        throw new AppError("Wallet is not active", 422);
      }

      const credit = await tx.wallet.updateMany({
        where: { id: wallet.id, version: wallet.version },
        data: { balance: { increment: amount }, version: { increment: 1 } },
      });
      if (credit.count === 0) throw new ConcurrencyConflict();

      const transaction = await tx.transaction.create({
        data: {
          toWalletId: wallet.id,
          amount,
          type: TransactionType.TOPUP,
          status: TransactionStatus.COMPLETED,
          description: "Virtual wallet top-up",
        },
      });

      return { transactionId: transaction.id, balance: wallet.balance.plus(amount) };
    })
  );
}

/**
 * Fulfills a pending Payment request: moves the money AND flips the
 * Payment from PENDING to COMPLETED in the same atomic DB transaction. The
 * Payment's status is claimed with an optimistic check (`WHERE status =
 * PENDING`) exactly like a wallet's version — if two "pay" requests race,
 * only one claim succeeds; the other's entire transaction (including its
 * wallet debit/credit) rolls back and retries, converging on "already
 * paid" instead of moving money twice.
 */
export async function payForPaymentRequest(params: {
  paymentId: string;
  payerWalletId: string;
  merchantWalletId: string;
  payerUserId: string;
  amount: string;
  description?: string;
  idempotencyKey: string;
}): Promise<TransferResult> {
  try {
    const transactionId = await withConflictRetry(() =>
      prisma.$transaction(async (tx) => {
      const transaction = await coreTransfer(tx, {
        fromWalletId: params.payerWalletId,
        toWalletId: params.merchantWalletId,
        amount: params.amount,
        type: TransactionType.MERCHANT_PAYMENT,
        description: params.description,
      });

      const claim = await tx.payment.updateMany({
        where: { id: params.paymentId, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.COMPLETED,
          payerUserId: params.payerUserId,
          transactionId: transaction.id,
          paymentIdempotencyKey: params.idempotencyKey,
        },
      });
      if (claim.count === 0) throw new ConcurrencyConflict();

      return transaction.id;
      })
    );

    return { transactionId, alreadyProcessed: false };
  } catch (error) {
    // A concurrent replay may lose the Payment PENDING→COMPLETED claim after
    // the original request commits. Its transfer rolls back; surface the
    // original successful transaction when the idempotency key matches.
    const settledPayment = await prisma.payment.findUnique({ where: { id: params.paymentId } });
    if (
      settledPayment?.status === PaymentStatus.COMPLETED &&
      settledPayment.paymentIdempotencyKey === params.idempotencyKey &&
      settledPayment.transactionId
    ) {
      return { transactionId: settledPayment.transactionId, alreadyProcessed: true };
    }
    throw error;
  }
}

/** Approves a pending refund and returns funds exactly once in one transaction. */
export async function completeRefund(params: { refundId: string; paymentId: string; fromWalletId: string; toWalletId: string; amount: string }): Promise<string> {
  return withConflictRetry(() => prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: params.refundId } });
    if (refund.status !== "PENDING") throw new ConcurrencyConflict();
    const transaction = await coreTransfer(tx, { fromWalletId: params.fromWalletId, toWalletId: params.toWalletId, amount: params.amount, type: TransactionType.REFUND, description: "Merchant refund" });
    const claimed = await tx.refund.updateMany({ where: { id: refund.id, status: "PENDING" }, data: { status: "COMPLETED", processedAt: new Date() } });
    if (!claimed.count) throw new ConcurrencyConflict();
    await tx.payment.update({ where: { id: params.paymentId }, data: { status: PaymentStatus.REFUNDED } });
    return transaction.id;
  }));
}
