import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { prisma } from "../../lib/prisma";
import { requireCsrfToken } from "../../middleware/csrf";
import { requireParam } from "../../lib/params";
import { parsePagination, paginatedResponse } from "../../lib/pagination";
import { updateMerchantStatusSchema } from "../../schemas/admin";
import { writeAuditLog } from "../../lib/audit";
import { NotFoundError } from "../../lib/AppError";
import { MerchantStatus } from "../../generated/prisma/client";

export const adminMerchantsRouter = Router();

const listMerchantsQuerySchema = z.object({
  status: z.nativeEnum(MerchantStatus).optional(),
});

adminMerchantsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const { status } = listMerchantsQuerySchema.parse(req.query);
    const where = status ? { status } : {};

    const [items, total] = await Promise.all([
      prisma.merchant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        include: { owner: { select: { email: true, fullName: true } } },
      }),
      prisma.merchant.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, pagination));
  })
);

adminMerchantsRouter.patch(
  "/:id",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const merchantId = requireParam(req, "id");
    const { status } = updateMerchantStatusSchema.parse(req.body);

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundError("Merchant not found");
    }

    const updated = await prisma.merchant.update({ where: { id: merchantId }, data: { status } });

    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: "admin.merchant.status_change",
      targetType: "Merchant",
      targetId: merchantId,
      metadata: { from: merchant.status, to: status },
      ipAddress: req.ip,
    });

    res.json({ merchant: updated });
  })
);
