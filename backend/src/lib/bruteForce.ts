import { prisma } from "./prisma";

const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

/**
 * Lockout is derived on the fly from recent LoginAttempt rows rather than a
 * stored "locked until" flag — no extra state to keep in sync, and it
 * recovers automatically as old failures age out of the window. That
 * matches this being a shared public testing environment (README §12 req.
 * 16): nothing here ever needs an admin to manually unblock a tester.
 */
export async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MS);
  const failedCount = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gte: since } },
  });
  return failedCount >= MAX_FAILED_ATTEMPTS;
}

export async function recordLoginAttempt(params: {
  email: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email: params.email,
      userId: params.userId,
      ipAddress: params.ipAddress ?? "unknown",
      userAgent: params.userAgent,
      success: params.success,
    },
  });
}
