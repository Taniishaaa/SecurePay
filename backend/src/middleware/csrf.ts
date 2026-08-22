import type { NextFunction, Request, Response } from "express";
import { ForbiddenError } from "../lib/AppError";
import { CSRF_COOKIE, CSRF_HEADER } from "../lib/session";

/**
 * Double-submit cookie check: the CSRF cookie is readable by our own
 * frontend JS (unlike the session cookie) but not settable by a
 * cross-origin attacker, so requiring the header to echo it back proves the
 * request originated from a page that could read our cookies — i.e. our own
 * origin. Mount on every state-changing route that also requires auth.
 */
export function requireCsrfToken(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.header(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new ForbiddenError("Missing or invalid CSRF token");
  }
  next();
}
