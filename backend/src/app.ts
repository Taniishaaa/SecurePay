import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { corsOptions } from "./config/cors";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { rateLimit } from "./middleware/rateLimit";
import { requestId } from "./middleware/requestId";

export const app = express();

// Behind the Nginx reverse proxy in every deployed environment; needed for
// correct client IPs (rate limiting, audit logs) and secure-cookie detection.
app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], baseUri: ["'self'"], frameAncestors: ["'none'"], objectSrc: ["'none'"] } } }));
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser(env.COOKIE_SECRET));
app.use(requestId);
app.use(requestLogger);
app.use(rateLimit("api", 300, 15 * 60 * 1000));

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
