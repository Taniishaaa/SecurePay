import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError";

interface Entry { count: number; resetAt: number }
const buckets = new Map<string, Entry>();

/** Small in-process limiter for the single demo instance; Redis can replace it later without route changes. */
export function rateLimit(namespace: string, max: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${namespace}:${req.ip}`;
    const existing = buckets.get(key);
    const entry = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;
    entry.count += 1;
    buckets.set(key, entry);
    if (entry.count > max) throw new AppError("Too many requests. Try again later.", 429);
    next();
  };
}
