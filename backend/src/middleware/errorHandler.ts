import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/AppError";

/** 404 fallback for unmatched routes — mount after all other routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}

/**
 * Centralized error handler. Operational errors (AppError, Zod validation)
 * return their own safe message; anything else is logged in full server-side
 * and reduced to a generic message for the client so internals never leak.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request data",
      details: err.flatten().fieldErrors,
      requestId: req.requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, requestId: req.requestId });
    return;
  }

  console.error("Unhandled error", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
  });

  res.status(500).json({
    error: "Something went wrong.",
    requestId: req.requestId,
  });
}
