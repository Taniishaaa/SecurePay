import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { prisma } from "../../lib/prisma";
import { parsePagination, paginatedResponse } from "../../lib/pagination";
import { TransactionStatus } from "../../generated/prisma/client";

export const adminTransactionsRouter = Router();

const listTransactionsQuerySchema = z.object({
  status: z.nativeEnum(TransactionStatus).optional(),
});

adminTransactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const { status } = listTransactionsQuerySchema.parse(req.query);
    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, pagination));
  })
);
