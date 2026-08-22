import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword, getDummyHash } from "../lib/password";
import { changePasswordSchema, loginSchema } from "../schemas/auth";
import { clearAuthCookies, createSession, setAuthCookies } from "../lib/session";
import { isLockedOut, recordLoginAttempt } from "../lib/bruteForce";
import { writeAuditLog, writeSecurityEvent } from "../lib/audit";
import { accountStatusMessage } from "../lib/accountStatus";
import { requireAuth } from "../middleware/auth";
import { requireCsrfToken } from "../middleware/csrf";
import { AppError, UnauthorizedError, ForbiddenError } from "../lib/AppError";
import { AccountStatus, SecurityEventSeverity, type User } from "../generated/prisma/client";
import { rateLimit } from "../middleware/rateLimit";

export const authRouter = Router();

function publicUser(user: User & { role: { name: string } }) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.name,
    accountStatus: user.accountStatus,
    mfaEnabled: user.mfaEnabled,
  };
}

authRouter.post(
  "/login",
  rateLimit("login", 10, 15 * 60 * 1000),
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const ipAddress = req.ip;
    const userAgent = req.get("user-agent");

    if (await isLockedOut(email)) {
      await recordLoginAttempt({ email, ipAddress, userAgent, success: false });
      await writeSecurityEvent({
        eventType: "LOGIN_LOCKED_OUT",
        severity: SecurityEventSeverity.MEDIUM,
        details: { email },
        ipAddress,
      });
      throw new AppError("Too many failed login attempts. Try again later.", 429);
    }

    const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });

    if (!user) {
      // Burn roughly the same time a real verify would take, so response
      // timing can't be used to tell "no such account" from "wrong password".
      await verifyPassword(await getDummyHash(), password);
      await recordLoginAttempt({ email, ipAddress, userAgent, success: false });
      throw new UnauthorizedError("Invalid email or password");
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      await recordLoginAttempt({ email, userId: user.id, ipAddress, userAgent, success: false });
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      await recordLoginAttempt({ email, userId: user.id, ipAddress, userAgent, success: false });
      await writeSecurityEvent({
        userId: user.id,
        eventType: "LOGIN_BLOCKED_ACCOUNT_STATUS",
        severity: SecurityEventSeverity.MEDIUM,
        details: { accountStatus: user.accountStatus },
        ipAddress,
      });
      throw new ForbiddenError(accountStatusMessage(user.accountStatus));
    }

    const session = await createSession(user.id, { ipAddress, userAgent });
    setAuthCookies(res, session);

    await recordLoginAttempt({ email, userId: user.id, ipAddress, userAgent, success: true });
    await writeAuditLog({
      actorId: user.id,
      actorRole: user.role.name,
      action: "auth.login",
      targetType: "User",
      targetId: user.id,
      ipAddress,
    });

    res.json({ user: publicUser(user) });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(requireAuth),
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    await prisma.session.update({ where: { id: req.sessionId }, data: { revoked: true } });
    clearAuthCookies(res);

    await writeAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "auth.logout",
      targetType: "User",
      targetId: req.user?.id,
      ipAddress: req.ip,
    });

    res.status(204).send();
  })
);

authRouter.post(
  "/password",
  asyncHandler(requireAuth),
  requireCsrfToken,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const userId = req.user!.id;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const currentValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!currentValid) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const passwordHash = await hashPassword(newPassword);

    // Changing the password revokes every session — including this one —
    // so a compromised session can't survive a password reset.
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.session.updateMany({ where: { userId, revoked: false }, data: { revoked: true } }),
    ]);

    clearAuthCookies(res);

    await writeAuditLog({
      actorId: userId,
      actorRole: req.user!.role,
      action: "auth.password_change",
      targetType: "User",
      targetId: userId,
      ipAddress: req.ip,
    });
    await writeSecurityEvent({
      userId,
      eventType: "PASSWORD_CHANGED",
      severity: SecurityEventSeverity.LOW,
      ipAddress: req.ip,
    });

    res.json({ status: "ok", message: "Password changed. Please log in again." });
  })
);

authRouter.get(
  "/me",
  asyncHandler(requireAuth),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      include: { role: true },
    });
    res.json({ user: publicUser(user) });
  })
);
