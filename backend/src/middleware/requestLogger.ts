import morgan from "morgan";
import { isProduction } from "../config/env";

/**
 * Request logging. Only method, path, status, and timing are logged —
 * never headers or body, since those can carry credentials, cookies, or
 * other sensitive fields. Detailed audit trails for security-relevant
 * actions are handled separately by the AuditLog write path, not here.
 */
export const requestLogger = morgan(isProduction ? "combined" : "dev");
