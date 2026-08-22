import { Router } from "express";
import { healthRouter } from "./health";
import { authRouter } from "./auth";
import { sessionsRouter } from "./sessions";
import { walletRouter } from "./wallet";
import { transactionsRouter } from "./transactions";
import { merchantRouter } from "./merchant";
import { paymentsRouter } from "./payments";
import { adminRouter } from "./admin";
import { refundsRouter } from "./refunds";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/sessions", sessionsRouter);
apiRouter.use("/wallet", walletRouter);
apiRouter.use("/transactions", transactionsRouter);
apiRouter.use("/merchant", merchantRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/refunds", refundsRouter);
