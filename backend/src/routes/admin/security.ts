import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler";
import { prisma } from "../../lib/prisma";
import { parsePagination, paginatedResponse } from "../../lib/pagination";
import { SecurityEventSeverity } from "../../generated/prisma/client";

export const adminSecurityRouter = Router();

adminSecurityRouter.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      prisma.auditLog.count(),
    ]);
    res.json(paginatedResponse(items, total, pagination));
  })
);

const listSecurityEventsQuerySchema = z.object({
  severity: z.nativeEnum(SecurityEventSeverity).optional(),
});

adminSecurityRouter.get(
  "/security-events",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const { severity } = listSecurityEventsQuerySchema.parse(req.query);
    const where = severity ? { severity } : {};

    const [items, total] = await Promise.all([
      prisma.securityEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      prisma.securityEvent.count({ where }),
    ]);
    res.json(paginatedResponse(items, total, pagination));
  })
);

const listLoginAttemptsQuerySchema = z.object({
  success: z.enum(["true", "false"]).optional(),
});

adminSecurityRouter.get(
  "/login-attempts",
  asyncHandler(async (req, res) => {
    const pagination = parsePagination(req);
    const { success } = listLoginAttemptsQuerySchema.parse(req.query);
    const where = success !== undefined ? { success: success === "true" } : {};

    const [items, total] = await Promise.all([
      prisma.loginAttempt.findMany({ where, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      prisma.loginAttempt.count({ where }),
    ]);
    res.json(paginatedResponse(items, total, pagination));
  })
);
