import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { hashToken, SESSION_COOKIE } from "../lib/session";
import { accountStatusMessage } from "../lib/accountStatus";
import { UnauthorizedError, ForbiddenError } from "../lib/AppError";
import { AccountStatus, type RoleName } from "../generated/prisma/client";

/**
 * Resolves the `sid` cookie to a live Session + User, or throws 401.
 * Mount on every route that needs an authenticated actor — nothing downstream
 * should re-derive identity from anything client-supplied.
 *
 * Account status is re-checked on every request, not just at login: an
 * admin freezing a user must take effect immediately against any session
 * that user already holds, not just block their next login.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.signedCookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) {
    throw new UnauthorizedError();
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { role: true } } },
  });

  if (!session || session.revoked || session.expiresAt < new Date()) {
    throw new UnauthorizedError();
  }

  if (session.user.accountStatus !== AccountStatus.ACTIVE) {
    throw new ForbiddenError(accountStatusMessage(session.user.accountStatus));
  }

  await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });

  req.user = {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.fullName,
    role: session.user.role.name,
  };
  req.sessionId = session.id;
  next();
}

/** Mount after requireAuth. Denies by default — only the listed roles pass. */
export function requireRole(...roles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError();
    }
    next();
  };
}
