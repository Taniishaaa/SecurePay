import type { CorsOptions } from "cors";
import { env } from "./env";

/**
 * Explicit origin allow-list only — no wildcard, ever. Credentialed
 * requests (cookies) require the reflected-origin form of CORS, so we
 * validate against CORS_ORIGIN rather than using `origin: true`.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // Allow non-browser / same-origin requests (no Origin header).
    if (!origin || env.CORS_ORIGIN.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
};
