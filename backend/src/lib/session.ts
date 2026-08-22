import crypto from "node:crypto";
import type { Response } from "express";
import { prisma } from "./prisma";
import { isProduction } from "../config/env";

export const SESSION_COOKIE = "sid";
export const CSRF_COOKIE = "csrfToken";
export const CSRF_HEADER = "x-csrf-token";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface CreatedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

/**
 * Creates a Session row and returns the raw token/CSRF value to hand back
 * to the client via cookies. Only the token's hash is ever persisted (see
 * schema comment on Session.tokenHash) — a database read alone can never
 * yield something usable to impersonate a session.
 */
export async function createSession(
  userId: string,
  info: { ipAddress?: string; userAgent?: string }
): Promise<CreatedSession> {
  const token = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      deviceInfo: info.userAgent?.slice(0, 255),
      ipAddress: info.ipAddress,
      userAgent: info.userAgent,
      expiresAt,
    },
  });

  return { token, csrfToken, expiresAt };
}

/**
 * `sid` is HttpOnly + signed (tamper-evident via COOKIE_SECRET) since only
 * the server ever needs to read it. `csrfToken` is deliberately NOT
 * HttpOnly and NOT signed — the frontend must be able to read its exact raw
 * value with JS and echo it back in the X-CSRF-Token header (double-submit
 * cookie pattern); signing would change the on-the-wire value the browser
 * exposes to JS and break that comparison.
 */
export function setAuthCookies(res: Response, session: CreatedSession): void {
  res.cookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    signed: true,
    expires: session.expiresAt,
    path: "/",
  });
  res.cookie(CSRF_COOKIE, session.csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    expires: session.expiresAt,
    path: "/",
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}
