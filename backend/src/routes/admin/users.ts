import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { prisma } from "../../lib/prisma";
import { requireCsrfToken } from "../../middleware/csrf";
import { requireParam } from "../../lib/params";
import { parsePagination, paginatedResponse } from "../../lib/pagination";
import { updateUserSchema } from "../../schemas/admin";
import { writeAuditLog, writeSecurityEvent } from "../../lib/audit";
import { AppError, NotFoundError } from "../../lib/AppError";
import { AccountStatus, RoleName, SecurityEventSeverity } from "../../generated/prisma/client";

export const adminUsersRouter = Router();

const listUsersQuerySchema = z.object({
  role: z.nativeEnum(RoleName).optional(),
  status: z.nativeEnum(AccountStatus).optional(),
});

adminUsersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const { role: roleFilter, status: statusFilter } = listUsersQuerySchema.parse(req.query);

    const where = {
      ...(roleFilter ? { role: { name: roleFilter } } : {}),
      ...(statusFilter ? { accountStatus: statusFilter } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          email: true,
          fullName: true,
          accountStatus: true,
          mfaEnabled: true,
          createdAt: true,
          role: { select: { name: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json(paginatedResponse(items, total, pagination));
  })
);

adminUsersRouter.patch(
  "/:id",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const userId = requireParam(req, "id");
    const { accountStatus, role } = updateUserSchema.parse(req.body);

    if (userId === req.user!.id) {
      throw new AppError("Cannot modify your own account via admin endpoints", 403);
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!target) {
      throw new NotFoundError("User not found");
    }

    const data: { accountStatus?: AccountStatus; roleId?: string } = {};
    if (accountStatus) {
      data.accountStatus = accountStatus;
    }
    if (role) {
      const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
      data.roleId = roleRow.id;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      include: { role: true },
    });

    // A status change to anything but ACTIVE must take effect immediately,
    // not just block the target's *next* login — kill their live sessions.
    if (accountStatus && accountStatus !== AccountStatus.ACTIVE) {
      await prisma.session.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
    }

    if (accountStatus) {
      await writeAuditLog({
        actorId: req.user!.id,
        actorRole: req.user!.role,
        action: "admin.user.status_change",
        targetType: "User",
        targetId: userId,
        metadata: { from: target.accountStatus, to: accountStatus },
        ipAddress: req.ip,
      });
      await writeSecurityEvent({
        userId,
        eventType: "ACCOUNT_STATUS_CHANGED_BY_ADMIN",
        severity: SecurityEventSeverity.MEDIUM,
        details: { from: target.accountStatus, to: accountStatus, adminId: req.user!.id },
        ipAddress: req.ip,
      });
    }
    if (role) {
      await writeAuditLog({
        actorId: req.user!.id,
        actorRole: req.user!.role,
        action: "admin.user.role_change",
        targetType: "User",
        targetId: userId,
        metadata: { from: target.role.name, to: role },
        ipAddress: req.ip,
      });
      await writeSecurityEvent({
        userId,
        eventType: "ROLE_CHANGED_BY_ADMIN",
        severity: SecurityEventSeverity.HIGH,
        details: { from: target.role.name, to: role, adminId: req.user!.id },
        ipAddress: req.ip,
      });
    }

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        accountStatus: updated.accountStatus,
        role: updated.role.name,
      },
    });
  })
);
