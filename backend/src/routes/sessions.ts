import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireCsrfToken } from "../middleware/csrf";
import { clearAuthCookies } from "../lib/session";
import { writeAuditLog } from "../lib/audit";
import { NotFoundError } from "../lib/AppError";
import { requireParam } from "../lib/params";

export const sessionsRouter = Router();

sessionsRouter.use(asyncHandler(requireAuth));

/** Own active sessions/devices — never another user's, there is no :userId param to tamper with. */
sessionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.id, revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true, deviceInfo: true, ipAddress: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });

    res.json({
      sessions: sessions.map((session) => ({ ...session, current: session.id === req.sessionId })),
    });
  })
);

/** Revoke one of the caller's own sessions. IDOR-safe: a session owned by someone else 404s, not 403. */
sessionsRouter.delete(
  "/:id",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const sessionId = requireParam(req, "id");
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== req.user!.id) {
      throw new NotFoundError("Session not found");
    }

    await prisma.session.update({ where: { id: session.id }, data: { revoked: true } });
    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: "session.revoke",
      targetType: "Session",
      targetId: session.id,
      ipAddress: req.ip,
    });

    if (session.id === req.sessionId) {
      clearAuthCookies(res);
    }

    res.status(204).send();
  })
);

/** Revoke every other session — "log out everywhere else". Leaves the current session alone. */
sessionsRouter.delete(
  "/",
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const result = await prisma.session.updateMany({
      where: { userId: req.user!.id, revoked: false, id: { not: req.sessionId } },
      data: { revoked: true },
    });

    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: "session.revoke_others",
      targetType: "User",
      targetId: req.user!.id,
      metadata: { revokedCount: result.count },
      ipAddress: req.ip,
    });

    res.json({ status: "ok", revokedCount: result.count });
  })
);
