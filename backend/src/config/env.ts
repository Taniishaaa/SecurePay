import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  // Supabase-hosted PostgreSQL in every shared environment; a local
  // Postgres connection string works the same way for local dev.
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Optional until the rate-limiting/session-cache phase wires Redis in.
  REDIS_URL: z.string().min(1).optional(),
  CORS_ORIGIN: z
    .string()
    .min(1, "CORS_ORIGIN is required")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
