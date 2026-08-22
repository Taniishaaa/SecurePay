import type { Request } from "express";
import { NotFoundError } from "./AppError";

/**
 * Express 5 types a route param as `string | string[] | undefined` (a
 * param can repeat in some path patterns). Every route here uses a single
 * named `:id`-style param, so a non-string value means the URL didn't
 * actually match what we expect — treat it the same as "not found" rather
 * than letting a malformed value reach a Prisma query.
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new NotFoundError();
  }
  return value;
}
